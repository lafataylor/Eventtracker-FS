"""Ticket 2: the NIGHTLY path must extract per POST, not per image.

Proves the two collapse bugs are fixed in the batch path, with the OpenAI
client mocked so these cost nothing:
  * one event shown across N slides  -> 1 event   (was N)
  * one slide listing N events       -> N events  (was 1)

Run: python manage.py test c_admin.test_batch_structured
"""

from unittest.mock import MagicMock, patch

from django.test import TestCase

from c_admin.extraction import PostExtraction
from c_admin.post_ingest import build_payloads, group_slides_by_post
from c_admin.test_extraction import mk_event


class GroupSlidesTests(TestCase):
    def test_carousel_slides_regroup_into_one_post(self):
        imgs = {'ABC__0': {}, 'ABC__1': {}, 'ABC__2': {}}
        grouped = group_slides_by_post(imgs)
        self.assertEqual(list(grouped), ['ABC'])
        self.assertEqual([s for _f, _i, s in grouped['ABC']], [0, 1, 2])

    def test_slides_sorted_even_when_scrambled(self):
        imgs = {'ABC__2': {}, 'ABC__0': {}, 'ABC__1': {}}
        self.assertEqual([s for _f, _i, s in group_slides_by_post(imgs)['ABC']],
                         [0, 1, 2])

    def test_single_image_post_and_underscore_shortcode(self):
        imgs = {'SOLO': {}, 'DC2LX__qOJ3': {}}
        grouped = group_slides_by_post(imgs)
        self.assertIn('SOLO', grouped)
        # A shortcode containing "__" must not be split into a fake slide.
        self.assertIn('DC2LX__qOJ3', grouped)

    def test_separate_posts_stay_separate(self):
        grouped = group_slides_by_post({'AAA__0': {}, 'BBB__0': {}})
        self.assertEqual(sorted(grouped), ['AAA', 'BBB'])


class BatchCollapseTests(TestCase):
    """The two failures the ticket describes, at the payload layer."""

    def test_one_event_across_eight_slides_yields_one(self):
        # Old behaviour: 8 slides labelled independently -> up to 8 events.
        extraction = PostExtraction(
            post_type="single",
            events=[mk_event(event_name="One Big Party", source_slide_index=0)])
        payloads = build_payloads(
            extraction, shortcode="single8", post_link="L",
            slide_urls=[f"i{n}" for n in range(8)])
        self.assertEqual(len(payloads), 1)

    def test_roundup_slide_yields_every_event(self):
        # Old behaviour: one slide -> one event, so a "this weekend" roundup
        # collapsed into a single event named after the caption.
        extraction = PostExtraction(
            post_type="roundup",
            events=[mk_event(event_name=n, source_slide_index=i)
                    for i, n in enumerate(["Fri Rave", "Sat Disco", "Sun Chill"])])
        payloads = build_payloads(
            extraction, shortcode="round3", post_link="L",
            slide_urls=["i0", "i1", "i2"])
        self.assertEqual(len(payloads), 3)
        self.assertEqual([p["name"] for p in payloads],
                         ["Fri Rave", "Sat Disco", "Sun Chill"])
        # Each event keeps its own slide image and a distinct source key input.
        self.assertEqual([p["orig_thumb"] for p in payloads], ["i0", "i1", "i2"])
        self.assertEqual([p["sourceSlideIndex"] for p in payloads], [0, 1, 2])

    def test_every_payload_carries_post_identity_for_upsert(self):
        extraction = PostExtraction(
            post_type="roundup",
            events=[mk_event(event_name="A", source_slide_index=0),
                    mk_event(event_name="B", source_slide_index=1)])
        payloads = build_payloads(extraction, shortcode="abc", post_link="L",
                                  slide_urls=["i0", "i1"])
        for p in payloads:
            self.assertEqual(p["shortcode"], "abc")
            self.assertIs(p["is_duplicate"], False)   # else invisible site-wide
            self.assertIsNotNone(p["timestamp"])      # else hidden from admin


class ExtractionCallShapeTests(TestCase):
    def test_all_slides_go_in_one_vision_call(self):
        """The whole point: one call per post, not one per slide."""
        from c_admin.extraction import extract_events
        extraction = PostExtraction(post_type="single",
                                    events=[mk_event(event_name="X")])
        client = MagicMock()
        client.beta.chat.completions.parse.return_value.choices = [MagicMock()]
        client.beta.chat.completions.parse.return_value.choices[0].message.parsed = extraction

        extract_events(client, ["s0", "s1", "s2", "s3"], caption="c")

        self.assertEqual(client.beta.chat.completions.parse.call_count, 1)
        _, kwargs = client.beta.chat.completions.parse.call_args
        images = [c for c in kwargs["messages"][0]["content"]
                  if c["type"] == "image_url"]
        self.assertEqual(len(images), 4)


class GroupingRobustnessTests(TestCase):
    """A shortcode can itself end in __<digits>; filename parsing alone would
    merge unrelated posts into one vision call."""

    def test_link_wins_over_filename_parsing(self):
        imgs = {
            'AB__12': {'link': 'https://www.instagram.com/p/AB__12/'},
            'CD__0':  {'link': 'https://www.instagram.com/p/CD/'},
        }
        grouped = group_slides_by_post(imgs)
        # AB__12 is a whole shortcode per its link, NOT slide 12 of post "AB".
        self.assertIn('AB__12', grouped)
        self.assertIn('CD', grouped)

    def test_carousel_still_groups_via_link(self):
        link = 'https://www.instagram.com/p/XYZ/'
        imgs = {'XYZ__0': {'link': link}, 'XYZ__1': {'link': link}}
        grouped = group_slides_by_post(imgs)
        self.assertEqual(list(grouped), ['XYZ'])
        self.assertEqual([s for _f, _i, s in grouped['XYZ']], [0, 1])

    def test_falls_back_to_filename_without_a_link(self):
        grouped = group_slides_by_post({'QQQ__0': {}, 'QQQ__1': {}})
        self.assertEqual(list(grouped), ['QQQ'])
