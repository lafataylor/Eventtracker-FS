"""Per-account Track feed / Track stories flags.

Replaces the hardcoded STORIES_SUBSET_ACCOUNTS / STORIES_SCRAPE_MODE in
scraper.py. Owner can turn feed and stories on independently on Manage
Accounts; both off means the account is not scraped for either path.
"""
from django.test import TestCase

from .models import Account
from .views import accounts_to_scrape
from .scraper import scrape_flags_for_accounts


class TrackFlagsModelTests(TestCase):
    def test_new_account_defaults_feed_on_stories_off(self):
        account = Account.objects.create(user='newbie', forLocation='Bali')
        self.assertTrue(account.track_feed)
        self.assertFalse(account.track_stories)

    def test_story_only_is_allowed(self):
        account = Account.objects.create(
            user='stories_only', forLocation='Berlin',
            track_feed=False, track_stories=True,
        )
        self.assertFalse(account.track_feed)
        self.assertTrue(account.track_stories)

    def test_feed_only_is_allowed(self):
        account = Account.objects.create(
            user='feed_only', forLocation='LA',
            track_feed=True, track_stories=False,
        )
        self.assertTrue(account.track_feed)
        self.assertFalse(account.track_stories)


class AccountsToScrapeTrackFlagsTests(TestCase):
    def setUp(self):
        Account.objects.create(
            user='both', forLocation='Berlin', status='Tracking',
            track_feed=True, track_stories=True,
        )
        Account.objects.create(
            user='feed_only', forLocation='Bali', status='Tracking',
            track_feed=True, track_stories=False,
        )
        Account.objects.create(
            user='story_only', forLocation='LA', status='Tracking',
            track_feed=False, track_stories=True,
        )
        Account.objects.create(
            user='neither', forLocation='Mexico City', status='Tracking',
            track_feed=False, track_stories=False,
        )
        Account.objects.create(
            user='paused', forLocation='Berlin', status='Paused',
            track_feed=True, track_stories=True,
        )

    def test_both_on_is_scraped_with_flags(self):
        got = accounts_to_scrape(['both'])
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]['user'], 'both')
        self.assertTrue(got[0]['track_feed'])
        self.assertTrue(got[0]['track_stories'])

    def test_feed_only_is_scraped(self):
        got = accounts_to_scrape(['feed_only'])
        self.assertEqual(len(got), 1)
        self.assertTrue(got[0]['track_feed'])
        self.assertFalse(got[0]['track_stories'])

    def test_story_only_is_scraped(self):
        got = accounts_to_scrape(['story_only'])
        self.assertEqual(len(got), 1)
        self.assertFalse(got[0]['track_feed'])
        self.assertTrue(got[0]['track_stories'])

    def test_both_off_is_skipped(self):
        # Tracking status alone is not enough when neither path is on.
        self.assertEqual(accounts_to_scrape(['neither']), [])

    def test_paused_is_still_skipped(self):
        self.assertEqual(accounts_to_scrape(['paused']), [])

    def test_null_flags_mean_feed_on_stories_off(self):
        # Pre-seed / nullable columns: None behaves like the model defaults.
        Account.objects.create(
            user='legacy_null', forLocation='Bali', status='Tracking',
            track_feed=None, track_stories=None,
        )
        got = accounts_to_scrape(['legacy_null'])
        self.assertEqual(len(got), 1)
        self.assertTrue(got[0]['track_feed'])
        self.assertFalse(got[0]['track_stories'])

    def test_duplicate_rows_or_their_flags(self):
        # Same handle, two cities: feed on one row, stories on the other.
        Account.objects.create(
            user='split', forLocation='Bali', status='Tracking',
            track_feed=True, track_stories=False,
        )
        Account.objects.create(
            user='split', forLocation='Berlin', status='Tracking',
            track_feed=False, track_stories=True,
        )
        got = accounts_to_scrape(['split'])
        self.assertEqual(len(got), 1)
        self.assertTrue(got[0]['track_feed'])
        self.assertTrue(got[0]['track_stories'])
        self.assertEqual(
            sorted(got[0]['forLocation'].split(',')),
            ['Bali', 'Berlin'],
        )

    def test_unknown_username_still_passed_through_with_defaults(self):
        got = accounts_to_scrape(['never_seen'])
        self.assertEqual(got, [{
            'user': 'never_seen',
            'forLocation': None,
            'track_feed': True,
            'track_stories': False,
        }])


class ScrapeFlagsForAccountsTests(TestCase):
    def setUp(self):
        Account.objects.create(
            user='feed_only', status='Tracking',
            track_feed=True, track_stories=False,
        )
        Account.objects.create(
            user='story_only', status='Tracking',
            track_feed=False, track_stories=True,
        )

    def test_flags_come_from_db_not_hardcoded_subset(self):
        flags = scrape_flags_for_accounts(['feed_only', 'story_only', 'unknown'])
        self.assertEqual(flags['feed_only'], (True, False))
        self.assertEqual(flags['story_only'], (False, True))
        # Unknown: feed default on, stories default off (no hardcode list).
        self.assertEqual(flags['unknown'], (True, False))


class SeedTrackFlagsMigrationTests(TestCase):
    """Seed: Tracking rows keep feed on; the three former subset names get stories."""

    def test_seed_sets_stories_for_former_subset_only(self):
        from .track_flags import seed_track_flags

        Account.objects.create(user='justineswinebar', status='Tracking')
        Account.objects.create(user='cafetondo', status='Tracking')
        Account.objects.create(user='10highdesign', status='Tracking')
        Account.objects.create(user='other_venue', status='Tracking')
        Account.objects.create(user='paused_one', status='Paused')

        # Simulate post-AddField state: nullable columns present, unset.
        Account.objects.all().update(track_feed=None, track_stories=None)

        seed_track_flags(Account)

        by_user = {a.user: a for a in Account.objects.all()}
        for name in ('justineswinebar', 'cafetondo', '10highdesign'):
            self.assertTrue(by_user[name].track_feed)
            self.assertTrue(by_user[name].track_stories)
        self.assertTrue(by_user['other_venue'].track_feed)
        self.assertFalse(by_user['other_venue'].track_stories)
        # Paused rows still get feed on (they were in Manage Accounts); stories off.
        self.assertTrue(by_user['paused_one'].track_feed)
        self.assertFalse(by_user['paused_one'].track_stories)


class AdminAccountUpdateTrackFlagsTests(TestCase):
    def setUp(self):
        import jwt
        from c_auth.models import User

        u = User.objects.create(email='track-flags@test.dev', usertype='admin')
        self.uid = str(u.id)
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')
        # AdminAccounts.get does .exclude(id=uid); keep Account.id != User.id.
        Account.objects.create(user='padding', created_by=self.uid)
        self.account = Account.objects.create(
            user='toggle_me', forLocation='Bali', status='Tracking',
            track_feed=True, track_stories=False, created_by=self.uid,
        )

    def test_put_updates_track_flags(self):
        response = self.client.put(
            '/v1/admin/accounts/',
            data={
                'id': self.account.id,
                'track_feed': False,
                'track_stories': True,
            },
            content_type='application/json',
            HTTP_AUTHORIZATION='Token ' + self.tok,
        )
        self.assertEqual(response.status_code, 200)
        self.account.refresh_from_db()
        self.assertFalse(self.account.track_feed)
        self.assertTrue(self.account.track_stories)

    def test_get_includes_track_flags(self):
        response = self.client.get(
            '/v1/admin/accounts/',
            HTTP_AUTHORIZATION='Token ' + self.tok,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        # AdminAccounts.get uses Success(data) without status=True → raw list.
        rows = body if isinstance(body, list) else body.get('data', body)
        match = next(r for r in rows if r.get('user') == 'toggle_me')
        self.assertIn('track_feed', match)
        self.assertIn('track_stories', match)
        self.assertTrue(match['track_feed'])
        self.assertFalse(match['track_stories'])
