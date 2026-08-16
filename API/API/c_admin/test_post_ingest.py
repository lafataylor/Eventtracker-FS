"""Offline tests for Apify post-shape handling (Ticket 2, phase C).

The manual add-by-URL bug was that only `displayUrl` was read, so a carousel
could never yield more than one event. These pin down every payload shape the
actor returns — no network, no API spend.

Run: python manage.py test c_admin.test_post_ingest
"""

from django.test import SimpleTestCase

from c_admin.extraction import PostExtraction
from c_admin.post_ingest import (build_payloads, mirror_slides, post_shortcode,
                                 shortcode_from_url, slide_image_urls)
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
        mirrored, originals = mirror_slides(
            ["u0", "u1", "u2"], exec_id="-1", user="acct", output_file_path="p",
            downloader=lambda url, path: seen.append(url),
            uploader=lambda e, u, f, p, link: f"hosted/{link}")
        self.assertEqual(seen, ["u0", "u1", "u2"])
        self.assertEqual(mirrored, ["hosted/u0", "hosted/u1", "hosted/u2"])
        self.assertEqual(originals, ["u0", "u1", "u2"])

    def test_one_bad_slide_does_not_kill_the_post(self):
        def flaky(url, path):
            if url == "u1":
                raise IOError("CDN hiccup")
        mirrored, _ = mirror_slides(
            ["u0", "u1", "u2"], exec_id="-1", user="a", output_file_path="p",
            downloader=flaky, uploader=lambda e, u, f, p, link: f"h/{link}")
        self.assertEqual(mirrored, ["h/u0", "h/u2"])

    def test_carousel_capped_at_20(self):
        mirrored, _ = mirror_slides(
            [f"u{i}" for i in range(30)], exec_id="-1", user="a",
            output_file_path="p", downloader=lambda u, p: None,
            uploader=lambda e, u, f, p, link: link)
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
