"""recover_skipped_posts: moves LastRun back only for accounts that lost posts.

Fixture: three accounts across a failed extraction night starting
2026-09-03 21:00 UTC.
- partial: one post failed on credits, another succeeded -> last_run advanced
  past the failure. THIS is the account that lost a post.
- healthy: nothing failed, last_run advanced -> nothing to recover.
- allfailed: every post failed, so the scraper never advanced last_run ->
  it retries by itself; touching it would only widen the window for nothing.
"""
from datetime import datetime, timedelta, timezone as dt_timezone
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from .models import LastRun, Logs

SINCE = "2026-09-03 21:00"
RESET_TO = "2026-09-02 21:00"
QUOTA = ("failed: Error code: 429 - {'error': {'message': 'You have no credits "
         "remaining.', 'type': 'insufficient_quota'}}")


def epoch(utc_string):
    return datetime.strptime(utc_string, "%Y-%m-%d %H:%M").replace(tzinfo=dt_timezone.utc).timestamp()


class RecoverSkippedPostsTests(TestCase):
    def setUp(self):
        night = "2026-09-04 22:%02d:00"
        rows = [
            ("[STRUCTURED] partial: 2 images -> 2 posts", "Step Progressed"),
            (f"[STRUCTURED] AAA111 {QUOTA}", "Step Failed"),
            ("[STRUCTURED] partial: saved 1 events", "Step Progressed"),
            ("[STRUCTURED] healthy: 1 images -> 1 posts", "Step Progressed"),
            ("[STRUCTURED] healthy: saved 1 events", "Step Progressed"),
            ("[STRUCTURED] allfailed: 1 images -> 1 posts", "Step Progressed"),
            (f"[STRUCTURED] BBB222 {QUOTA}", "Step Failed"),
            ("[STRUCTURED] all 1 posts failed for allfailed; leaving last_run", "Step Failed"),
        ]
        for i, (message, status) in enumerate(rows):
            Logs.objects.create(scraped_at=night % i, message=message, status=status)
        # last_run values: the two that advanced sit inside the failed night,
        # allfailed stays where the previous healthy night left it.
        LastRun.objects.create(account="partial", last_run=str(epoch("2026-09-04 22:05")))
        LastRun.objects.create(account="healthy", last_run=str(epoch("2026-09-04 22:06")))
        LastRun.objects.create(account="allfailed", last_run=str(epoch("2026-09-02 22:00")))

    def run_cmd(self, *extra):
        out = StringIO()
        call_command("recover_skipped_posts", "--since", SINCE, "--reset-to", RESET_TO, *extra, stdout=out)
        return out.getvalue()

    def last_run(self, account):
        return float(LastRun.objects.get(account=account).last_run)

    def test_dry_run_selects_only_the_account_that_lost_a_post(self):
        out = self.run_cmd()
        self.assertIn("1 selected", out)
        self.assertIn("partial: 1 failed post(s)", out)
        self.assertNotIn("healthy:", out)
        self.assertNotIn("allfailed:", out)
        self.assertIn("no writes", out)
        self.assertEqual(self.last_run("partial"), epoch("2026-09-04 22:05"))

    def test_apply_moves_only_the_selected_account_back(self):
        self.run_cmd("--apply")
        self.assertEqual(self.last_run("partial"), epoch(RESET_TO))
        self.assertEqual(self.last_run("healthy"), epoch("2026-09-04 22:06"))
        self.assertEqual(self.last_run("allfailed"), epoch("2026-09-02 22:00"))

    def test_all_advanced_widens_to_every_advanced_account(self):
        out = self.run_cmd("--all-advanced", "--apply")
        self.assertIn("2 selected", out)
        self.assertEqual(self.last_run("partial"), epoch(RESET_TO))
        self.assertEqual(self.last_run("healthy"), epoch(RESET_TO))
        # Not advanced -> not touched even in the wide mode.
        self.assertEqual(self.last_run("allfailed"), epoch("2026-09-02 22:00"))

    def test_refuses_to_write_while_the_pipeline_is_running(self):
        Logs.objects.create(status="Step Progressed", message="[STRUCTURED] busy: 1 images -> 1 posts",
                            scraped_at=timezone.now().strftime("%Y-%m-%d %H:%M:%S"))
        with self.assertRaises(CommandError):
            self.run_cmd("--apply")
        self.assertEqual(self.last_run("partial"), epoch("2026-09-04 22:05"))

    def test_rejects_a_reset_point_after_since(self):
        with self.assertRaises(CommandError):
            call_command("recover_skipped_posts", "--since", SINCE, "--reset-to", "2026-09-04 21:00",
                         stdout=StringIO())
