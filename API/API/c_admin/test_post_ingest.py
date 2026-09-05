"""Offline tests for Apify post-shape handling (Ticket 2, phase C).

The manual add-by-URL bug was that only `displayUrl` was read, so a carousel
could never yield more than one event. These pin down every payload shape the
actor returns — no network, no API spend.

Run: python manage.py test c_admin.test_post_ingest
"""

from django.test import SimpleTestCase

from c_admin.extraction import PostExtraction
from c_admin.post_ingest import (build_payloads, mirror_slides, post_shortcode,
                                 shortcode_from_url, slide_image_urls,
                                 split_child_shortcode)
from c_admin.test_extraction import mk_event


class SlideUrlTests(SimpleTestCase):
    def test_sidecar_childposts_preferred(self):
        post = {
            "type": "Sidecar",
            "displayUrl": "cover.jpg",
            "childPosts": [{"displayUrl": "s0.jpg"}, {"displayUrl": "s1.jpg"},
                           {"displayUrl": "s2.jpg"}],
            "images": ["ignored.jpg"],
        }
        self.assertEqual(slide_image_urls(post), ["s0.jpg", "s1.jpg", "s2.jpg"])

    def test_sidecar_images_fallback(self):
        post = {"type": "Sidecar", "images": ["a.jpg", "b.jpg"], "displayUrl": "c.jpg"}
        self.assertEqual(slide_image_urls(post), ["a.jpg", "b.jpg"])

    def test_images_as_dicts(self):
        post = {"type": "Sidecar", "images": [{"url": "a.jpg"}, {"displayUrl": "b.jpg"}]}
        self.assertEqual(slide_image_urls(post), ["a.jpg", "b.jpg"])

    def test_single_image_post(self):
        # The old code's ONLY case — must still work.
        self.assertEqual(slide_image_urls({"type": "Image", "displayUrl": "one.jpg"}),
                         ["one.jpg"])

    def test_malformed_carousel_falls_back_to_display_url(self):
        post = {"type": "Sidecar", "childPosts": [{}], "images": [], "displayUrl": "d.jpg"}
        self.assertEqual(slide_image_urls(post), ["d.jpg"])

    def test_duplicates_removed_order_preserved(self):
        post = {"images": ["a.jpg", "b.jpg", "a.jpg", "c.jpg"]}
        self.assertEqual(slide_image_urls(post), ["a.jpg", "b.jpg", "c.jpg"])

    def test_empty_and_garbage(self):
        self.assertEqual(slide_image_urls({}), [])
        self.assertEqual(slide_image_urls(None), [])

    def test_shortcode_key_spellings(self):
        self.assertEqual(post_shortcode({"shortCode": "A"}), "A")
        self.assertEqual(post_shortcode({"shortcode": "B"}), "B")
        self.assertIsNone(post_shortcode({}))


class SplitChildShortcodeTests(SimpleTestCase):
    """The batch path keys images as "{shortcode}__{idx}"; parsing it back is
    what lets the nightly scraper upsert instead of re-inserting."""

    def test_carousel_slide(self):
        self.assertEqual(split_child_shortcode("DDz_j5Cpz9s__3"), ("DDz_j5Cpz9s", 3))
        self.assertEqual(split_child_shortcode("abc__0"), ("abc", 0))

    def test_single_image_post_has_no_slide(self):
        self.assertEqual(split_child_shortcode("DDz_j5Cpz9s"), ("DDz_j5Cpz9s", None))

    def test_shortcode_containing_double_underscore(self):
        # Real production shortcodes contain "__" (e.g. DC2LX__qOJ3). Only a
        # trailing all-digit segment is a slide index — otherwise the audit's
        # "72 slide markers" false positive repeats here.
        self.assertEqual(split_child_shortcode("DC2LX__qOJ3"), ("DC2LX__qOJ3", None))
        self.assertEqual(split_child_shortcode("DF__sAxRaTs"), ("DF__sAxRaTs", None))
        # ...and that same shortcode WITH a slide still parses correctly
        self.assertEqual(split_child_shortcode("DC2LX__qOJ3__5"), ("DC2LX__qOJ3", 5))

    def test_story_key(self):
        self.assertEqual(split_child_shortcode("story_12345"), ("story_12345", None))

    def test_empty(self):
        self.assertEqual(split_child_shortcode(None), (None, None))
        self.assertEqual(split_child_shortcode(""), (None, None))


class ShortcodeFromUrlTests(SimpleTestCase):
    def test_plain_post_url(self):
        self.assertEqual(
            shortcode_from_url("https://www.instagram.com/p/DDz_j5Cpz9s/"),
            "DDz_j5Cpz9s")

    def test_share_link_query_string_stripped(self):
        # A naive split('/') would fold "?igsh=..." into the shortcode, giving a
        # different source_key on every paste and defeating the upsert.
        self.assertEqual(
            shortcode_from_url("https://www.instagram.com/p/DDz_j5Cpz9s/?igsh=MXY123=="),
            "DDz_j5Cpz9s")

    def test_reel_and_tv(self):
        self.assertEqual(shortcode_from_url("https://instagram.com/reel/ABC123/"), "ABC123")
        self.assertEqual(shortcode_from_url("https://instagram.com/tv/XYZ789/"), "XYZ789")

    def test_story_url(self):
        self.assertEqual(
            shortcode_from_url("https://www.instagram.com/stories/venue/3881994638587956331/"),
            "story_3881994638587956331")

    def test_no_shortcode(self):
        self.assertIsNone(shortcode_from_url("https://instagram.com/someuser/"))
        self.assertIsNone(shortcode_from_url(None))

    def test_matches_migration_backfill(self):
        # Must agree with migration 0010's POST_RE, or a URL parsed here would
        # produce a different shortcode than the backfilled rows.
        from event.migrations import __name__ as _  # noqa: F401
        import importlib
        mod = importlib.import_module('event.migrations.0010_backfill_shortcode'
                                      .replace('0010', '0010'))
        url = "https://www.instagram.com/p/DDz_j5Cpz9s/"
        self.assertEqual(mod.extract_shortcode(url), shortcode_from_url(url))


class MirrorSlideTests(SimpleTestCase):
    def test_all_slides_mirrored(self):
        seen = []
        mirrored, real_indexes = mirror_slides(
            ["u0", "u1", "u2"], exec_id="-1", user="acct", output_file_path="p",
            downloader=lambda url, path: seen.append(url),
            uploader=lambda e, u, f, p, link: f"http://hosted/{link}")
        self.assertEqual(seen, ["u0", "u1", "u2"])
        self.assertEqual(mirrored,
                         ["http://hosted/u0", "http://hosted/u1", "http://hosted/u2"])
        self.assertEqual(real_indexes, [0, 1, 2])

    def test_one_bad_slide_does_not_kill_the_post_and_indexes_stay_real(self):
        def flaky(url, path):
            if url == "u1":
                raise IOError("CDN hiccup")
        mirrored, real_indexes = mirror_slides(
            ["u0", "u1", "u2"], exec_id="-1", user="a", output_file_path="p",
            downloader=flaky, uploader=lambda e, u, f, p, link: f"http://h/{link}")
        self.assertEqual(mirrored, ["http://h/u0", "http://h/u2"])
        # The surviving slides keep their ORIGINAL numbers — this is what lets
        # callers remap the model's shown-index back before building source_key.
        self.assertEqual(real_indexes, [0, 2])

    def test_error_body_from_uploader_is_rejected(self):
        # saveImage returns the HTTP response body, truthy even for an error
        # page. A non-URL return must be skipped, not treated as a hosted URL.
        def uploader(e, u, f, p, link):
            return "Error: could not handle the request" if link == "u1" else f"http://h/{link}"
        mirrored, real_indexes = mirror_slides(
            ["u0", "u1", "u2"], exec_id="-1", user="a", output_file_path="p",
            downloader=lambda u, p: None, uploader=uploader)
        self.assertEqual(mirrored, ["http://h/u0", "http://h/u2"])
        self.assertEqual(real_indexes, [0, 2])

    def test_carousel_capped_at_20(self):
        mirrored, _ = mirror_slides(
            [f"u{i}" for i in range(30)], exec_id="-1", user="a",
            output_file_path="p", downloader=lambda u, p: None,
            uploader=lambda e, u, f, p, link: f"http://x/{link}")
        self.assertEqual(len(mirrored), 20)


class BuildPayloadTests(SimpleTestCase):
    def test_each_event_gets_its_own_slide_image(self):
        extraction = PostExtraction(post_type="roundup", events=[
            mk_event(event_name="A", source_slide_index=0),
            mk_event(event_name="B", source_slide_index=2)])
        payloads = build_payloads(
            extraction, shortcode="abc", post_link="L",
            slide_urls=["i0", "i1", "i2"], for_location="Mexico City")
        self.assertEqual(len(payloads), 2)
        self.assertEqual(payloads[0]["orig_thumb"], "i0")
        self.assertEqual(payloads[1]["orig_thumb"], "i2")
        self.assertEqual(payloads[1]["sourceSlideIndex"], 2)
        self.assertEqual(payloads[0]["shortcode"], "abc")
        self.assertEqual(payloads[0]["forLocation"], "Mexico City")

    def test_out_of_range_slide_falls_back_to_first_image(self):
        extraction = PostExtraction(post_type="single", events=[
            mk_event(event_name="A", source_slide_index=9)])
        payloads = build_payloads(extraction, shortcode="abc", post_link="L",
                                  slide_urls=["only.jpg"])
        self.assertEqual(payloads[0]["orig_thumb"], "only.jpg")

    def test_no_images_does_not_crash(self):
        extraction = PostExtraction(post_type="single", events=[mk_event()])
        payloads = build_payloads(extraction, shortcode="abc", post_link="L",
                                  slide_urls=[])
        self.assertIsNone(payloads[0]["orig_thumb"])


class ContentIdentityTests(SimpleTestCase):
    """Multi-event posts must key each event on WHAT it is, not WHERE the
    extractor listed it. Replays the 2026-08-27 incident: re-extracting a
    roundup returned a subset, reordered, on a different slide, and the
    positional key made a different event overwrite an existing row."""

    def _payloads(self, events):
        return build_payloads(PostExtraction(post_type="roundup", events=events),
                              shortcode="RENATE", post_link="L",
                              slide_urls=["s0", "s1"])

    def test_multi_event_post_gets_content_keys(self):
        p = self._payloads([
            mk_event(event_name="GARDEN hosted by Remoto Rec", start_date="08-26-2026", source_slide_index=0),
            mk_event(event_name="GREEN hosted by Remoto Rec", start_date="08-26-2026", source_slide_index=0)])
        self.assertTrue(p[0]["source_key"].startswith("RENATE__e"))
        self.assertNotEqual(p[0]["source_key"], p[1]["source_key"])

    def test_reordered_subset_on_other_slide_keeps_same_keys(self):
        run1 = self._payloads([
            mk_event(event_name="GARDEN hosted by Remoto Rec", start_date="08-26-2026", source_slide_index=0),
            mk_event(event_name="GREEN hosted by Remoto Rec", start_date="08-26-2026", source_slide_index=0),
            mk_event(event_name="RED hosted by Franz Scala", start_date="08-28-2026", source_slide_index=0)])
        run2 = self._payloads([                      # subset, reversed, slide 1
            mk_event(event_name="red hosted by FRANZ SCALA", start_date="08-28-2026", source_slide_index=1),
            mk_event(event_name="Garden hosted by Remoto Rec", start_date="08-26-2026", source_slide_index=1)])
        keys1 = {x["name"].lower(): x["source_key"] for x in run1}
        keys2 = {x["name"].lower(): x["source_key"] for x in run2}
        self.assertEqual(keys2["red hosted by franz scala"], keys1["red hosted by franz scala"])
        self.assertEqual(keys2["garden hosted by remoto rec"], keys1["garden hosted by remoto rec"])

    def test_same_title_different_dates_are_different_events(self):
        p = self._payloads([
            mk_event(event_name="Klubnacht", start_date="08-27-2026"),
            mk_event(event_name="Klubnacht", start_date="08-28-2026")])
        self.assertNotEqual(p[0]["source_key"], p[1]["source_key"])

    def test_nameless_event_in_multi_post_keeps_positional_identity(self):
        p = self._payloads([
            mk_event(event_name="Named", start_date="08-27-2026", source_slide_index=0),
            mk_event(event_name=None, source_slide_index=0)])
        self.assertNotIn("source_key", p[1])          # server derives __0__1
        self.assertEqual(p[1]["sourceOrdinal"], 1)

    def test_single_recurring_series_stays_positional(self):
        # One seed event expanded to several dates in code: the expansion is
        # deterministic, so positional keys are stable and preferable to
        # hashing a model-inferred anchor date that may drift a day.
        p = build_payloads(PostExtraction(post_type="recurring", events=[
            mk_event(event_name="Klubnacht", start_date="08-27-2026",
                     recurrence="weekly", recurrence_until="09-10-2026")]),
            shortcode="abc", post_link="L", slide_urls=["s0"])
        self.assertGreater(len(p), 1)
        self.assertTrue(all("source_key" not in x for x in p))
        self.assertEqual([x["sourceOrdinal"] for x in p], list(range(len(p))))

    def test_recurring_series_inside_a_roundup_stays_positional(self):
        # A roundup holding one recurring series plus one distinct event: the
        # series' expanded rows keep positional keys (stable, code-generated),
        # the distinct event gets a content key.
        p = self._payloads([
            mk_event(event_name="Weekly Jam", start_date="08-27-2026",
                     recurrence="weekly", recurrence_until="09-10-2026"),
            mk_event(event_name="One Off Gala", start_date="08-30-2026")])
        series = [x for x in p if x["name"] == "Weekly Jam"]
        gala = [x for x in p if x["name"] == "One Off Gala"]
        self.assertGreater(len(series), 1)
        self.assertTrue(all("source_key" not in x for x in series))
        self.assertEqual(len(gala), 1)
        self.assertTrue(gala[0]["source_key"].startswith("RENATE__e"))

    def test_same_name_same_date_different_time_are_distinct(self):
        p = self._payloads([
            mk_event(event_name="Late Set", start_date="08-27-2026", start_time="10:00 PM"),
            mk_event(event_name="Late Set", start_date="08-27-2026", start_time="2:00 AM")])
        self.assertNotEqual(p[0]["source_key"], p[1]["source_key"])

    def test_single_event_post_stays_positional(self):
        p = build_payloads(PostExtraction(post_type="single", events=[
            mk_event(event_name="Only one", start_date="08-27-2026")]),
            shortcode="abc", post_link="L", slide_urls=["s0"])
        self.assertNotIn("source_key", p[0])
        self.assertEqual(p[0]["sourceOrdinal"], 0)


class ServedMetroFilterTests(SimpleTestCase):
    """Owner rule (2026-09-01): "when one post grabs events from a whole tour
    with other cities I would like to just drop them unless they are cities
    that are currently on my list", i.e. Berlin, Bali, LA, Mexico City.

    The filter acts ONLY on an explicit OTHER. Deciding on the city string was
    measured against 14 days of production rows and would have deleted ~146
    real events whose city is a neighbourhood, so everything else is kept."""

    def _payloads(self, events):
        return build_payloads(
            PostExtraction(post_type="roundup", events=events),
            shortcode="TOUR", post_link="https://insta/p/TOUR/",
            slide_urls=["s0.jpg"])

    def test_tour_drops_only_the_other_metro_stops(self):
        p = self._payloads([
            mk_event(event_name="Berlin show", city="Berlin", metro="Berlin"),
            mk_event(event_name="Hamburg show", city="Hamburg", metro="OTHER"),
            mk_event(event_name="London show", city="London", metro="OTHER"),
        ])
        self.assertEqual([x["name"] for x in p], ["Berlin show"])

    def test_neighbourhoods_are_kept(self):
        # the ~146-events-per-fortnight regression this design exists to avoid
        p = self._payloads([
            mk_event(event_name="Roma Norte party", city="Roma Norte",
                     metro="Mexico City"),
            mk_event(event_name="Neukoelln rave", city="Neukoelln",
                     metro="Berlin"),
            mk_event(event_name="Seminyak beach", city="Seminyak", metro="Bali"),
            mk_event(event_name="DTLA gig", city="DTLA", metro="Los Angeles"),
        ])
        self.assertEqual(len(p), 4)

    def test_unknown_metro_is_kept(self):
        p = self._payloads([mk_event(event_name="No location given",
                                     metro="UNKNOWN")])
        self.assertEqual(len(p), 1)

    def test_non_event_payload_is_never_dropped(self):
        # non-events mark the post processed; dropping them re-bills OpenAI
        p = self._payloads([mk_event(is_event=False, event_name="promo flyer",
                                     city="Paris", metro="OTHER")])
        self.assertEqual(len(p), 1)

    def test_surviving_rows_keep_their_source_keys(self):
        events = [
            mk_event(event_name="Berlin show", start_date="09-10-2026",
                     metro="Berlin"),
            mk_event(event_name="Hamburg show", start_date="09-11-2026",
                     metro="OTHER"),
            mk_event(event_name="Bali show", start_date="09-12-2026",
                     metro="Bali"),
        ]
        filtered = self._payloads(events)
        # same keys as if nothing had been dropped: ordinals are assigned
        # before the filter runs
        unfiltered = self._payloads(
            [mk_event(event_name=e.event_name, start_date=e.start_date,
                      metro="UNKNOWN") for e in events])
        keys = {x["name"]: x.get("source_key") for x in unfiltered}
        for row in filtered:
            self.assertEqual(row.get("source_key"), keys[row["name"]])

    # Validation on 2026-09-05 against the real model: a Uluwatu post came back
    # metro=OTHER although the prompt lists Uluwatu under Bali. The safety net
    # below keeps any OTHER row whose city/state names a known served area.
    def test_other_with_a_known_served_area_is_kept(self):
        p = self._payloads([
            mk_event(event_name="Motel Mexicola Uluwatu Grand Opening",
                     city="Uluwatu", metro="OTHER"),
            mk_event(event_name="Rave", city="Neukölln", metro="OTHER"),
            mk_event(event_name="Dinner", city="Colonia Roma Norte",
                     metro="OTHER"),
            mk_event(event_name="Beach day", city=None, state="Bali",
                     metro="OTHER"),
            mk_event(event_name="Show", city="Highland Park, Los Angeles",
                     metro="OTHER"),
        ])
        self.assertEqual(len(p), 5)

    def test_other_with_an_unknown_place_still_drops(self):
        p = self._payloads([
            mk_event(event_name="Hamburg show", city="Hamburg", metro="OTHER"),
            mk_event(event_name="No city", city=None, metro="OTHER"),
            # "la" is an alias only as the whole string, never inside "La Paz"
            mk_event(event_name="La Paz show", city="La Paz", metro="OTHER"),
            mk_event(event_name="Kept", city="Kreuzberg", metro="OTHER"),
        ])
        self.assertEqual([x["name"] for x in p], ["Kept"])

    def test_served_metro_for_matching_rules(self):
        from c_admin.post_ingest import served_metro_for
        self.assertEqual(served_metro_for("Uluwatu"), "Bali")
        self.assertEqual(served_metro_for("uluwatu, bali"), "Bali")
        self.assertEqual(served_metro_for("Neukölln"), "Berlin")
        self.assertEqual(served_metro_for("CDMX"), "Mexico City")
        self.assertEqual(served_metro_for("LA"), "Los Angeles")
        self.assertIsNone(served_metro_for("La Paz"))
        self.assertIsNone(served_metro_for("Hamburg"))
        self.assertIsNone(served_metro_for(None))
        self.assertIsNone(served_metro_for("   "))
