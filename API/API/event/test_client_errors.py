"""The browser-crash reporting endpoint.

Both 2026-09-01 outages reached us because the owner sent a screenshot. The
server returned 200 throughout — the failure happens after hydration — so
nothing server-side could see it. This endpoint is how the next one announces
itself.
"""
import json
from unittest.mock import patch

from django.test import TestCase


class ClientErrorEndpointTests(TestCase):
    URL = '/v1/event/clientError/'

    def _post(self, payload, **extra):
        return self.client.post(self.URL, json.dumps(payload),
                                content_type='application/json', **extra)

    def test_a_crash_is_recorded_without_authentication(self):
        # a crashing page cannot be asked to hold a valid session
        with patch('event.views.client_error_logger') as log:
            r = self._post({'message': "Cannot read properties of undefined",
                            'stack': 'at DashboardFilter',
                            'path': '/mexico-city/'})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(log.warning.called)
        logged = log.warning.call_args[0][0]
        self.assertIn('/mexico-city/', logged)
        self.assertIn('Cannot read properties of undefined', logged)

    def test_an_oversized_payload_is_truncated_not_rejected(self):
        with patch('event.views.client_error_logger') as log:
            r = self._post({'message': 'x' * 10000, 'stack': 'y' * 90000,
                            'path': '/' + 'z' * 5000})
        self.assertEqual(r.status_code, 200)
        logged = log.warning.call_args[0][0]
        self.assertLess(len(logged), 6000)

    def test_a_burst_from_one_client_is_capped(self):
        # a render loop can fire this hundreds of times a second
        from event import views
        views._client_error_hits.clear(); views._client_error_totals.clear()
        with patch('event.views.client_error_logger') as log:
            for _ in range(40):
                self._post({'message': 'boom', 'path': '/'},
                           HTTP_X_REAL_IP='203.0.113.9')
        self.assertLessEqual(log.warning.call_count, views.CLIENT_ERROR_MAX_PER_MIN)

    def test_junk_body_does_not_500(self):
        r = self.client.post(self.URL, 'not json',
                             content_type='application/json')
        self.assertIn(r.status_code, (200, 400))

    def test_missing_message_is_rejected(self):
        r = self._post({'path': '/'})
        self.assertEqual(r.status_code, 400)


class ClientErrorHardeningTests(TestCase):
    """This endpoint is unauthenticated and reachable from the open internet,
    so every field is hostile input. Flagged by security review 2026-09-01."""

    URL = '/v1/event/clientError/'

    def setUp(self):
        from event import views
        views._client_error_hits.clear()
        views._client_error_totals.clear()

    def _post(self, payload, **extra):
        return self.client.post(self.URL, json.dumps(payload),
                                content_type='application/json', **extra)

    def test_newlines_cannot_forge_extra_log_lines(self):
        # without stripping, this payload writes its own convincing entry into
        # the file a human reads to find out why the site broke
        forged = ("real\r\nCLIENT CRASH path=/ source=127.0.0.1 "
                  "message=nothing to see here")
        with patch('event.views.client_error_logger') as log:
            r = self._post({'message': forged, 'path': "/a\nb",
                            'stack': "x\r\ny"})
        self.assertEqual(r.status_code, 200)
        logged = log.warning.call_args[0][0]
        self.assertNotIn('\n', logged)
        self.assertNotIn('\r', logged)

    def test_a_spoofed_forwarded_header_cannot_reset_the_cap(self):
        # nginx APPENDS to X-Forwarded-For, so the leftmost entry is whatever
        # the client claimed. Rotating it must not buy more reports.
        from event import views
        with patch('event.views.client_error_logger') as log:
            for i in range(40):
                self._post({'message': 'boom'},
                           HTTP_X_FORWARDED_FOR=f'10.0.0.{i}, 198.51.100.7')
        self.assertLessEqual(log.warning.call_count,
                             views.CLIENT_ERROR_MAX_PER_MIN)

    def test_real_ip_is_preferred_over_a_claimed_forwarded_value(self):
        from event import views
        with patch('event.views.client_error_logger') as log:
            for i in range(40):
                self._post({'message': 'boom'},
                           HTTP_X_REAL_IP='198.51.100.7',
                           HTTP_X_FORWARDED_FOR=f'10.0.0.{i}')
        self.assertLessEqual(log.warning.call_count,
                             views.CLIENT_ERROR_MAX_PER_MIN)

    def test_many_distinct_sources_are_globally_capped(self):
        # the per-source key can never be fully trusted; the global cap is
        # what actually protects the disk
        from event import views
        with patch('event.views.client_error_logger') as log:
            for i in range(600):
                self._post({'message': 'boom'},
                           HTTP_X_REAL_IP=f'203.0.113.{i % 256}')
            # count only recorded crashes; the one THROTTLED notice is not one
            crashes = [c for c in log.warning.call_args_list
                       if 'CLIENT CRASH path' in str(c[0][0])]
        self.assertLessEqual(len(crashes),
                             views.CLIENT_ERROR_MAX_PER_MIN_TOTAL)

    def test_the_tracking_map_stays_bounded(self):
        from event import views
        for i in range(3000):
            self._post({'message': 'boom'}, HTTP_X_REAL_IP=f'198.51.{i//256}.{i%256}')
        self.assertLessEqual(len(views._client_error_hits),
                             views.CLIENT_ERROR_MAX_TRACKED)

    def test_junk_requests_do_not_burn_the_budget(self):
        # an attacker firing empty bodies must not silently blind the monitor
        from event import views
        views._client_error_hits.clear(); views._client_error_totals.clear()
        for _ in range(300):
            self._post({'path': '/no-message'}, HTTP_X_REAL_IP='203.0.113.1')
        with patch('event.views.client_error_logger') as log:
            r = self._post({'message': 'a genuine crash'},
                           HTTP_X_REAL_IP='198.51.100.2')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(log.warning.called, 'a real report was dropped')

    def test_unicode_line_separators_cannot_forge_a_line(self):
        with patch('event.views.client_error_logger') as log:
            self._post({'message': 'a CLIENT CRASH forged b'})
        logged = log.warning.call_args[0][0]
        self.assertNotIn(' ', logged)
        self.assertNotIn(' ', logged)

    def test_a_deeply_nested_value_does_not_500(self):
        # str() on deep nesting raises RecursionError, which is not ValueError
        payload = {'message': 'ok', 'stack': [[[[[['deep']]]]]]}
        r = self._post(payload)
        self.assertEqual(r.status_code, 200)

    def test_a_throttle_flood_leaves_a_trace(self):
        from event import views
        views._client_error_hits.clear(); views._client_error_totals.clear()
        with patch('event.views.client_error_logger') as log:
            for i in range(views.CLIENT_ERROR_MAX_PER_MIN_TOTAL + 30):
                self._post({'message': 'flood'}, HTTP_X_REAL_IP=f'203.0.113.{i % 250}')
            messages = [str(c[0][0]) for c in log.warning.call_args_list]
        self.assertTrue(any('THROTTLED' in m for m in messages),
                        'a suppressed flood must not look like silence')
