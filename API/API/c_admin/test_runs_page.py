"""The Runs page must not sort a two-million-row log table by an unindexed
text column.

`read_logs` ordered `Logs` by `scraped_at` (a CharField, no index) to take the
newest 500 of 2.1 million rows: 7.6 s per page view on production
(2026-09-18), the second of the two things the owner meant by "the backend
is slower and laggier than I've ever seen it". Rows are appended in time
order, so the primary key gives the same order for free.
"""
import jwt
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from c_auth.models import User
from .models import Logs


class RunsPageTests(TestCase):
    def setUp(self):
        u = User.objects.create(email='runs@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')

    def _get(self):
        res = self.client.get('/v1/admin/system/logs/', HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(res.status_code, 200)
        return res.json()['data']

    def test_the_page_gets_the_newest_runs_oldest_first(self):
        # The page renders bottom-up: oldest first, newest at the bottom.
        for i in range(5):
            Logs.objects.create(scraped_at=str(1000 + i), status='Completed', message='m%d' % i)
        self.assertEqual([l['message'] for l in self._get()], ['m0', 'm1', 'm2', 'm3', 'm4'])

    def test_only_the_newest_500_are_returned(self):
        for i in range(505):
            Logs.objects.create(scraped_at=str(i), status='Completed', message='m%d' % i)
        logs = self._get()
        self.assertEqual(len(logs), 500)
        self.assertEqual(logs[-1]['message'], 'm504')
        self.assertEqual(logs[0]['message'], 'm5')

    def test_an_older_in_progress_run_is_kept_and_shown_last(self):
        Logs.objects.create(scraped_at='1', status='In Progress', message='running')
        for i in range(3):
            Logs.objects.create(scraped_at=str(10 + i), status='Completed', message='done%d' % i)
        self.assertEqual(self._get()[-1]['message'], 'running')

    def test_no_sort_on_the_unindexed_text_column(self):
        for i in range(20):
            Logs.objects.create(scraped_at=str(i), status='Completed', message='x')
        with CaptureQueriesContext(connection) as ctx:
            self._get()
        for q in ctx.captured_queries:
            self.assertNotIn('ORDER BY "c_admin_logs"."scraped_at"', q['sql'])

    def test_the_in_progress_lookup_does_not_scan_the_whole_table(self):
        # Second half of the same problem, found in the 2026-09-18 end-to-end
        # pass on a copy of production: `status` has no index either, so
        # finding the running scrape scanned all 2.1 million rows (1.2 s of
        # the page's remaining time). A run in progress is by definition
        # recent, so the lookup is bounded to the newest ids.
        for i in range(30):
            Logs.objects.create(scraped_at=str(i), status='Completed', message='x')
        with CaptureQueriesContext(connection) as ctx:
            self._get()
        lookups = [q['sql'] for q in ctx.captured_queries if "'In Progress'" in q['sql'] or '"status" =' in q['sql']]
        self.assertTrue(lookups, 'expected an In Progress lookup')
        for sql in lookups:
            self.assertIn('"c_admin_logs"."id" >', sql, 'the status lookup must be bounded by id')

    def test_an_in_progress_row_outside_the_recent_window_is_not_pinned(self):
        # A row stuck "In Progress" from long ago is a dead run, not a live
        # one: it keeps its place in the log instead of being pinned as the
        # running scrape (the page shows the running one last).
        from unittest import mock
        Logs.objects.create(scraped_at='1', status='In Progress', message='dead run')
        for i in range(15):
            Logs.objects.create(scraped_at=str(i), status='Completed', message='done%d' % i)
        with mock.patch('c_admin.views.IN_PROGRESS_LOOKBACK', 10):
            logs = self._get()
        self.assertEqual(logs[-1]['message'], 'done14')
        self.assertEqual(logs[0]['message'], 'dead run')
