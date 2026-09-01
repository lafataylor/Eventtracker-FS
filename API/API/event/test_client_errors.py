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
        views._client_error_hits.clear()
        with patch('event.views.client_error_logger') as log:
            for _ in range(40):
                self._post({'message': 'boom', 'path': '/'},
                           REMOTE_ADDR='203.0.113.9')
        self.assertLessEqual(log.warning.call_count, views.CLIENT_ERROR_MAX_PER_MIN)

    def test_junk_body_does_not_500(self):
        r = self.client.post(self.URL, 'not json',
                             content_type='application/json')
        self.assertIn(r.status_code, (200, 400))

    def test_missing_message_is_rejected(self):
        r = self._post({'path': '/'})
        self.assertEqual(r.status_code, 400)
