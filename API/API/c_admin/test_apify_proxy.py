"""Admin Apify proxy endpoints keep the token off the browser.

Publish/Cursor Publish must not ship NEXT_PUBLIC_APIFY_API_KEY. The two FE
features that used to call Apify from the browser (Import Following, experimental
scrape) go through authenticated Django endpoints that use server-only
APIFY_API_KEY. Nightly scrape and add-by-URL stay on their existing paths.
"""
import os
from unittest import mock

import jwt
from django.test import SimpleTestCase, TestCase

from c_auth.models import User


class _FakeActor:
    def __init__(self, run):
        self._run = run

    def call(self, run_input=None):
        self.last_input = run_input
        return self._run


class _FakeDataset:
    def __init__(self, items):
        self._items = items

    def iterate_items(self):
        for item in self._items:
            yield item


class _FakeApifyClient:
    def __init__(self, token, actors=None, datasets=None):
        self.token = token
        self._actors = actors or {}
        self._datasets = datasets or {}

    def actor(self, name):
        if name not in self._actors:
            raise AssertionError('unexpected actor: %r' % name)
        return self._actors[name]

    def dataset(self, dataset_id):
        if dataset_id not in self._datasets:
            raise AssertionError('unexpected dataset: %r' % dataset_id)
        return self._datasets[dataset_id]


class ApifyProxyAuthTests(TestCase):
    def test_following_list_rejects_unauthenticated_requests(self):
        res = self.client.post('/v1/admin/followingList/',
                               data={'account': 'someone'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 403)

    def test_experimental_scrape_rejects_unauthenticated_requests(self):
        res = self.client.post('/v1/admin/experimentalScrape/',
                               data={'username': 'someone'},
                               content_type='application/json')
        self.assertEqual(res.status_code, 403)


class ApifyFollowingListTests(TestCase):
    def setUp(self):
        u = User.objects.create(email='apify-proxy@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')

    def _post(self, payload):
        return self.client.post(
            '/v1/admin/followingList/',
            data=payload,
            content_type='application/json',
            HTTP_AUTHORIZATION='Token ' + self.tok,
        )

    def test_missing_account_is_rejected(self):
        res = self._post({})
        self.assertEqual(res.status_code, 400)

    def test_missing_apify_key_is_a_server_error(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop('APIFY_API_KEY', None)
            res = self._post({'account': 'cdmx.shows'})
        self.assertEqual(res.status_code, 403)
        self.assertIn('Apify API key', res.json()['message'])

    def test_returns_unique_following_ids_and_drops_suggestions(self):
        following_run = {'defaultDatasetId': 'following-ds'}
        following_items = [
            {'id': 'alpha', 'introduction': ''},
            {'id': 'beta', 'introduction': 'Suggested for you'},
            {'id': 'alpha', 'introduction': 'friend'},
            {'id': 'gamma', 'introduction': None},
        ]
        fake = _FakeApifyClient(
            token='server-key',
            actors={'sejinius/instagram-following-scraper': _FakeActor(following_run)},
            datasets={'following-ds': _FakeDataset(following_items)},
        )
        with mock.patch.dict(os.environ, {'APIFY_API_KEY': 'server-key'}):
            with mock.patch('c_admin.views.ApifyClient', return_value=fake) as ctor:
                res = self._post({'account': 'cdmx.shows'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['following'], ['alpha', 'gamma'])
        ctor.assert_called_once_with('server-key')
        self.assertEqual(
            fake.actor('sejinius/instagram-following-scraper').last_input,
            {'instaId': 'cdmx.shows'},
        )


class ApifyExperimentalScrapeTests(TestCase):
    def setUp(self):
        u = User.objects.create(email='apify-exp@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')

    def _post(self, payload):
        return self.client.post(
            '/v1/admin/experimentalScrape/',
            data=payload,
            content_type='application/json',
            HTTP_AUTHORIZATION='Token ' + self.tok,
        )

    def test_missing_username_is_rejected(self):
        res = self._post({})
        self.assertEqual(res.status_code, 400)

    def test_returns_profile_and_posts_from_server_apify(self):
        profile_run = {'defaultDatasetId': 'profile-ds'}
        posts_run = {'defaultDatasetId': 'posts-ds'}
        profile_items = [{
            'biography': 'CDMX nights',
            'externalUrl': 'https://example.com/tickets',
        }]
        post_items = [{
            'type': 'Image',
            'displayUrl': 'https://cdn.example/a.jpg',
            'caption': 'tonight',
            'images': [],
        }, {
            'type': 'Sidecar',
            'displayUrl': 'https://cdn.example/cover.jpg',
            'caption': 'carousel',
            'images': ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg'],
        }]
        fake = _FakeApifyClient(
            token='server-key',
            actors={
                'apify/instagram-profile-scraper': _FakeActor(profile_run),
                'apify/instagram-post-scraper': _FakeActor(posts_run),
            },
            datasets={
                'profile-ds': _FakeDataset(profile_items),
                'posts-ds': _FakeDataset(post_items),
            },
        )
        with mock.patch.dict(os.environ, {'APIFY_API_KEY': 'server-key'}):
            with mock.patch('c_admin.views.ApifyClient', return_value=fake) as ctor:
                res = self._post({'username': 'some.promoter'})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['biography'], 'CDMX nights')
        self.assertEqual(body['externalUrl'], 'https://example.com/tickets')
        self.assertEqual(len(body['posts']), 2)
        self.assertEqual(body['posts'][1]['images'], [
            'https://cdn.example/1.jpg', 'https://cdn.example/2.jpg',
        ])
        ctor.assert_called_once_with('server-key')
        self.assertEqual(
            fake.actor('apify/instagram-profile-scraper').last_input,
            {'usernames': ['some.promoter']},
        )
        self.assertEqual(
            fake.actor('apify/instagram-post-scraper').last_input,
            {'username': ['some.promoter'], 'resultsLimit': 5},
        )


class NoPublicApifyKeyInFrontendTests(SimpleTestCase):
    """Regression: the Publish finding was NEXT_PUBLIC_APIFY_API_KEY in the FE."""

    def test_fe_env_example_does_not_advertise_a_public_apify_key(self):
        from pathlib import Path
        example = Path(__file__).resolve().parents[3] / 'FE' / '.env.example'
        text = example.read_text(encoding='utf-8')
        self.assertNotIn('NEXT_PUBLIC_APIFY_API_KEY', text)

    def test_fe_source_does_not_read_a_public_apify_key(self):
        from pathlib import Path
        fe_root = Path(__file__).resolve().parents[3] / 'FE'
        offenders = []
        for path in fe_root.rglob('*'):
            if path.suffix not in {'.ts', '.tsx', '.js', '.jsx', '.env.example'}:
                continue
            if 'node_modules' in path.parts:
                continue
            text = path.read_text(encoding='utf-8', errors='ignore')
            if 'NEXT_PUBLIC_APIFY_API_KEY' in text:
                offenders.append(str(path.relative_to(fe_root)))
        self.assertEqual(offenders, [])
