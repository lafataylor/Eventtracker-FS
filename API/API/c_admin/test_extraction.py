"""Offline regression tests for Ticket 2 carousel extraction.

Proves the H1/H2 fixes WITHOUT any OpenAI spend, by mocking the client and
running the real parse -> to_api_payload -> source_key upsert flow:

  * a single event across many slides -> ONE event   (no more over-splitting)
  * a roundup post                    -> N events     (no more collapse)
  * re-scraping the same post         -> zero new rows (upsert dedupe)
  * two null-name events on one slide -> two rows      (positional-key collision fix)

Run: python manage.py test c_admin.test_extraction
"""

from unittest.mock import MagicMock

from django.test import TestCase

from c_admin.extraction import (ExtractedEvent, PostExtraction, extract_events,
                                to_api_payload)
from event.ingest import build_source_key, coerce_int, upsert_event
from event.models import Event


def mk_event(**over):
    """An ExtractedEvent with sane empty defaults; override what a test cares about."""
    base = dict(
        is_event=True, event_name=None, artists=[], openers=[], hosts=[],
        promoters=[], offerings=[], genres=None, start_date=None, end_date=None,
        start_time=None, end_time=None, venue=None, address=None, city=None,
        state=None, country=None, overall_address=None, price=None, currency=None,
        age_barrier=None, ticket_link=None, late=False, link_in_bio=False,
        rsvp_required=False, source_slide_index=None,
    )
    base.update(over)
    return ExtractedEvent(**base)


def mock_openai(extraction):
    """A client whose parse() returns the given PostExtraction."""
    client = MagicMock()
    client.beta.chat.completions.parse.return_value.choices = [MagicMock()]
    client.beta.chat.completions.parse.return_value.choices[0].message.parsed = extraction
    return client


def ingest(extraction, shortcode, post_link="https://insta/p/x/", image_urls=None):
    """Mirror AdminEvent.post's per-post ordinal counter + upsert, for the fields
    that matter to counting/dedupe. Returns the list of row ids touched."""
    image_urls = image_urls or ["http://img/0.jpg"]
    ordinals, ids = {}, []
    for ev in extraction.events:
        slide = ev.source_slide_index
        okey = (shortcode, coerce_int(slide))
        ordinal = ordinals.get(okey, 0)
        ordinals[okey] = ordinal + 1
        source_key = build_source_key(shortcode, slide, ordinal)
        payload = to_api_payload(
            ev, shortcode=shortcode, slide_index=slide, ordinal=ordinal,
            post_link=post_link, image_url=image_urls[0])
        defaults = dict(
            name=payload["name"], artist=payload["artist"],
            is_event=payload["isEvent"], orig_link=payload["orig_link"],
            orig_thumb=payload["orig_thumb"], forLocation=payload["forLocation"])
        obj, _ = upsert_event(Event, source_key, shortcode, slide, defaults)
        ids.append(obj.id)
    return ids


class ExtractionParseTests(TestCase):
    def test_extract_events_uses_structured_output(self):
        extraction = PostExtraction(post_type="single", events=[mk_event(event_name="X")])
        client = mock_openai(extraction)
        result = extract_events(client, ["http://a.jpg", "http://b.jpg"], caption="c")
        self.assertEqual(result.post_type, "single")
        self.assertEqual(len(result.events), 1)
        # all slide images went in ONE request
        _, kwargs = client.beta.chat.completions.parse.call_args
        images = [c for c in kwargs["messages"][0]["content"] if c["type"] == "image_url"]
        self.assertEqual(len(images), 2)

    def test_payload_maps_lists_and_slide(self):
        ev = mk_event(event_name="Rave", artists=["A", "B"], source_slide_index=2,
                      venue="Warehouse", city="Berlin")
        p = to_api_payload(ev, shortcode="abc", slide_index=2, ordinal=0,
                           post_link="L", image_url="I")
        self.assertEqual(p["name"], "Rave")
        self.assertEqual(p["artist"], "A, B")          # list -> joined string
        self.assertEqual(p["sourceSlideIndex"], 2)
        self.assertEqual(p["shortcode"], "abc")
        self.assertEqual(p["venue"]["city"], "Berlin")


class CarouselIngestTests(TestCase):
    def test_single_event_many_slides_becomes_one(self):
        # H1/H2: 8-slide post, but it's ONE event -> exactly one row.
        extraction = PostExtraction(
            post_type="single",
            events=[mk_event(event_name="One Big Party", source_slide_index=0)])
        ids = ingest(extraction, "single8", image_urls=[f"i{n}" for n in range(8)])
        self.assertEqual(len(ids), 1)
        self.assertEqual(Event.objects.filter(shortcode="single8").count(), 1)

    def test_roundup_becomes_many(self):
        # H1/H2: roundup -> one row per distinct event.
        extraction = PostExtraction(
            post_type="roundup",
            events=[mk_event(event_name=n, source_slide_index=i)
                    for i, n in enumerate(["Fri Party", "Sat Rave", "Sun Chill"])])
        ids = ingest(extraction, "round3")
        self.assertEqual(len(set(ids)), 3)
        self.assertEqual(Event.objects.filter(shortcode="round3").count(), 3)

    def test_rescrape_does_not_duplicate(self):
        extraction = PostExtraction(
            post_type="roundup",
            events=[mk_event(event_name=n, source_slide_index=i)
                    for i, n in enumerate(["A", "B", "C"])])
        ingest(extraction, "rescrape")
        ingest(extraction, "rescrape")   # scraped again
        ingest(extraction, "rescrape")   # and again
        self.assertEqual(Event.objects.filter(shortcode="rescrape").count(), 3)

    def test_two_nameless_events_one_slide_dont_collide(self):
        # positional-key collision fix: both events null-name, same slide.
        extraction = PostExtraction(
            post_type="roundup",
            events=[mk_event(source_slide_index=0), mk_event(source_slide_index=0)])
        ids = ingest(extraction, "nameless")
        self.assertEqual(len(set(ids)), 2)
        self.assertEqual(Event.objects.filter(shortcode="nameless").count(), 2)

    def test_recurring_is_one_event(self):
        extraction = PostExtraction(
            post_type="recurring",
            events=[mk_event(event_name="Every Thursday", source_slide_index=0)])
        ids = ingest(extraction, "weekly")
        self.assertEqual(len(ids), 1)
