"""Apify stories/reels runs must request a recency window, not filter after fetch."""

from django.test import SimpleTestCase

from c_admin.scraper import (
    APIFY_REELS_NEWER_THAN,
    APIFY_REELS_RESULTS_LIMIT,
    fetch_story_image_objects,
)


class _FakeActor:
    def __init__(self):
        self.last_input = None

    def call(self, run_input=None):
        self.last_input = run_input
        return {"id": "run-1", "defaultDatasetId": "ds-1"}


class _FakeDataset:
    def iterate_items(self):
        return iter(())


class _FakeClient:
    def __init__(self):
        self._actor = _FakeActor()

    def actor(self, name):
        if name != "apify/instagram-scraper":
            raise AssertionError("unexpected actor: %r" % name)
        return self._actor

    def dataset(self, dataset_id):
        return _FakeDataset()


class ApifyReelsRecencyInputTests(SimpleTestCase):
    def test_constants_match_the_seven_day_window(self):
        self.assertEqual(APIFY_REELS_NEWER_THAN, "7 days")
        self.assertGreaterEqual(APIFY_REELS_RESULTS_LIMIT, 1)
        self.assertLessEqual(APIFY_REELS_RESULTS_LIMIT, 50)

    def test_story_run_input_asks_apify_for_last_seven_days_only(self):
        client = _FakeClient()
        result = fetch_story_image_objects(
            client, "10highdesign", biography="", externalUrl="", last_fetched=0,
        )
        self.assertEqual(result, [])
        self.assertEqual(
            client._actor.last_input,
            {
                "resultsType": "stories",
                "directUrls": ["https://www.instagram.com/10highdesign/"],
                "onlyPostsNewerThan": "7 days",
                "resultsLimit": APIFY_REELS_RESULTS_LIMIT,
            },
        )
