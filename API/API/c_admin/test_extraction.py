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
from event.ingest import (build_source_key, coerce_int, content_source_key,
                          upsert_event)
from event.models import Event


class ContentSourceKeyTests(TestCase):
    def test_normalises_case_and_accents(self):
        self.assertEqual(content_source_key("abc", "Café Klubnacht", "08-27-2026"),
                         content_source_key("abc", "cafe KLUBNACHT", "08-27-2026"))

    def test_date_is_part_of_identity(self):
        self.assertNotEqual(content_source_key("abc", "Klubnacht", "08-27-2026"),
                            content_source_key("abc", "Klubnacht", "08-28-2026"))

    def test_none_without_title_or_shortcode(self):
        self.assertIsNone(content_source_key("abc", None, "08-27-2026"))
        self.assertIsNone(content_source_key("abc", "  ", "08-27-2026"))
        self.assertIsNone(content_source_key(None, "Klubnacht", "08-27-2026"))

    def test_same_name_no_date_no_time_uses_ordinal_so_no_collision(self):
        # Two "TBA" slots with the same title in one roundup must not share a
        # key (a shared key would let one overwrite the other on refresh).
        a = content_source_key("abc", "Secret Set", None, None, ordinal=0)
        b = content_source_key("abc", "Secret Set", None, None, ordinal=1)
        self.assertNotEqual(a, b)
        # ...but the same undated event re-extracted at the same slot matches.
        self.assertEqual(a, content_source_key("abc", "secret set", "", "", ordinal=0))

    def test_ordinal_ignored_when_a_date_or_time_exists(self):
        self.assertEqual(content_source_key("abc", "X", "08-27-2026", None, ordinal=0),
                         content_source_key("abc", "X", "08-27-2026", None, ordinal=5))

    def test_cannot_collide_with_positional_keys(self):
        # positional keys are {shortcode}__{int}__{int}; content keys carry a
        # non-numeric marker so the two namespaces can never overlap.
        self.assertTrue(content_source_key("abc", "X", None).startswith("abc__e"))

    def test_refresh_replay_never_overwrites_a_different_event(self):
        """The incident, end to end at the upsert layer: run 2 returns a subset
        in another order; with content keys each upsert lands on its own row
        and the manual refresh (overwrite=True) only ever touches the same
        event."""
        run1 = [("GARDEN hosted by Remoto Rec", "08-26-2026", "6:00 PM"),
                ("GREEN hosted by Remoto Rec", "08-26-2026", "10:00 PM"),
                ("RED hosted by Franz Scala", "08-28-2026", None)]
        for name, day, t in run1:
            upsert_event(Event, content_source_key("RENATE", name, day), "RENATE", 0,
                         dict(name=name, start_time=t, is_duplicate=False))
        run2 = [("Red hosted by Franz Scala", "08-28-2026", "11:00 PM"),
                ("Garden hosted by Remoto Rec", "08-26-2026", "6:00 PM")]
        for name, day, t in run2:
            upsert_event(Event, content_source_key("RENATE", name, day), "RENATE", 1,
                         dict(name=name, start_time=t, is_duplicate=False), overwrite=True)
        self.assertEqual(Event.objects.filter(shortcode="RENATE").count(), 3)
        green = Event.objects.get(name="GREEN hosted by Remoto Rec")
        self.assertEqual(green.start_time, "10:00 PM")          # untouched by run 2
        red = Event.objects.get(source_key=content_source_key("RENATE", "RED hosted by Franz Scala", "08-28-2026"))
        self.assertEqual(red.start_time, "11:00 PM")            # refreshed in place


def mk_event(**over):
    """An ExtractedEvent with sane empty defaults; override what a test cares about."""
    base = dict(
        is_event=True, event_name=None, artists=[], openers=[], hosts=[],
        promoters=[], offerings=[], genres=None, start_date=None, end_date=None,
        start_time=None, end_time=None, venue=None, address=None, city=None,
        state=None, country=None, overall_address=None, price=None, currency=None,
        age_barrier=None, ticket_link=None, late=False, link_in_bio=False,
        rsvp_required=False, source_slide_index=None,
        recurrence=None, recurrence_until=None,
        # Default UNKNOWN: tests that do not care about geography must never
        # be silently dropped by the served-metro filter.
        metro="UNKNOWN",
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

    def test_prompt_anchors_on_post_date_when_given(self):
        # Weekday-only flyers ("Wed / Thu / Fri") resolved to different calendar
        # dates run to run because the prompt anchored on TODAY. The post's
        # publish date is the right anchor for "this week"-style wording.
        from c_admin.extraction import build_messages
        msgs = build_messages(["http://img/1.jpg"], "Wed: X / Thu: Y", "", "",
                              post_date="2026-08-24")
        text = msgs[-1]["content"][0]["text"]
        # Long form, never ISO: an ISO anchor made the model emit ISO
        # start_dates, which the server could not parse (stored as null).
        self.assertIn("published on August 24, 2026", text)
        self.assertNotIn("2026-08-24", text)
        self.assertIn("relative to the PUBLISH date", text)
        self.assertIn("MM-DD-YYYY regardless", text)

    def test_prompt_survives_an_unparseable_post_date(self):
        from c_admin.extraction import build_messages
        text = build_messages(["http://img/1.jpg"], "x", "", "", post_date=1754500397)[-1]["content"][0]["text"]
        self.assertIn("Today's date is", text)
        self.assertNotIn("published on", text)

    def test_prompt_falls_back_to_today_without_post_date(self):
        from c_admin.extraction import build_messages
        text = build_messages(["http://img/1.jpg"], "x", "", "")[-1]["content"][0]["text"]
        self.assertNotIn("published on", text)
        self.assertIn("Today's date is", text)

    def test_extract_events_passes_post_date_through(self):
        extraction = PostExtraction(post_type="single", events=[mk_event(event_name="X")])
        client = mock_openai(extraction)
        extract_events(client, ["http://a.jpg"], caption="c", post_date="2026-08-24T18:00:00.000Z")
        _, kwargs = client.beta.chat.completions.parse.call_args
        text = kwargs["messages"][0]["content"][0]["text"]
        self.assertIn("published on August 24, 2026", text)   # ISO timestamp -> long-form date

    def test_payload_sets_visibility_fields(self):
        """Regression: omitting these saved the event but hid it from the site.

        AdminEvent.post stores is_duplicate verbatim and every read path filters
        is_duplicate=False, which never matches NULL. AdminEvent.get filters
        timestamp__gte, so a null timestamp hides the event from admin too.
        """
        p = to_api_payload(mk_event(event_name="X", start_date=None),
                           shortcode="s", slide_index=0, ordinal=0,
                           post_link="L", image_url="I", poster="acct")
        self.assertIs(p["is_duplicate"], False)      # not None
        self.assertIsNotNone(p["timestamp"])         # falls back to today
        self.assertIsNone(p["startDate"])            # but the real date stays honest
        self.assertEqual(p["poster"], "acct")        # Account FK + AccountDetail overrides

    def test_payload_prefers_real_start_date_for_timestamp(self):
        p = to_api_payload(mk_event(event_name="X", start_date="09-01-2026"),
                           shortcode="s", slide_index=0, ordinal=0,
                           post_link="L", image_url="I")
        self.assertEqual(p["timestamp"], "09-01-2026")

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

    def test_recurring_expands_to_one_event_per_date(self):
        # Product owner: a recurring post should create a separate entry per
        # date, not one entry for the series.
        from c_admin.extraction import expand_recurring
        series = mk_event(event_name="Every Thursday", source_slide_index=0,
                          start_date="09-03-2026", recurrence="weekly",
                          recurrence_until="09-24-2026")
        dates = [e.start_date for e in expand_recurring([series])]
        self.assertEqual(dates, ["09-03-2026", "09-10-2026", "09-17-2026", "09-24-2026"])

    def test_open_ended_series_is_capped(self):
        from c_admin.extraction import expand_recurring, MAX_OCCURRENCES
        series = mk_event(event_name="Every Thursday", start_date="09-03-2026",
                          recurrence="weekly")
        self.assertEqual(len(expand_recurring([series])), MAX_OCCURRENCES)

    def test_non_recurring_event_untouched(self):
        from c_admin.extraction import expand_recurring
        one_off = mk_event(event_name="One Night", start_date="09-03-2026")
        self.assertEqual(len(expand_recurring([one_off])), 1)

    def test_recurring_without_date_not_expanded(self):
        from c_admin.extraction import expand_recurring
        bad = mk_event(event_name="Weekly", start_date=None, recurrence="weekly")
        self.assertEqual(len(expand_recurring([bad])), 1)

    def test_recurrence_until_before_start_keeps_the_event(self):
        # A backwards recurrence_until used to break at n=0 having appended
        # nothing, silently deleting the event instead of degrading to one.
        from c_admin.extraction import expand_recurring
        backwards = mk_event(event_name="Bad Range", start_date="09-10-2026",
                             recurrence="weekly", recurrence_until="09-01-2026")
        out = expand_recurring([backwards])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].start_date, "09-10-2026")

    def test_rescrape_does_not_resurrect_owner_hidden_duplicate(self):
        # The owner hides a duplicate (is_duplicate/suppressed True). The nightly
        # scraper re-ingests the same source_key with is_duplicate=False. The
        # owner's decision must survive.
        key = build_source_key("hidden", 0, 0)
        obj, _ = upsert_event(Event, key, "hidden", 0,
                              dict(name="Rave", is_event=True, orig_link="L"))
        obj.is_duplicate = True
        obj.suppressed = True
        obj.save()
        upsert_event(Event, key, "hidden", 0,
                     dict(name="Rave", is_event=True, orig_link="L",
                          is_duplicate=False, suppressed=False))
        obj.refresh_from_db()
        self.assertTrue(obj.is_duplicate)   # still hidden
        self.assertTrue(obj.suppressed)
