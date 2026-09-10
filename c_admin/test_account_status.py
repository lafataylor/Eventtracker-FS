"""Account status must actually stop an account being scraped.

`Account.status` has existed since the model was written, defaulting to
"Tracking", and nothing has ever read it: `cronRun.py` GETs every account from
`admin/accounts/` with no filter, and the admin table renders the word
"Tracking" as literal text regardless of the stored value. So the one obvious
way to retire an account - set its status - silently did nothing, and the only
alternative was deleting the row, which cascades (`Event.poster`,
on_delete=CASCADE) and would have destroyed 163 events for the four Oaxaca
accounts alone.

`accounts_to_scrape()` is the seam: the run builds its list through it, so a
non-Tracking account is skipped without touching the listing the admin UI
uses, and without cronRun.py needing to change.
"""
from django.test import TestCase

from .models import Account
from .views import accounts_to_scrape


class AccountsToScrapeTests(TestCase):
    def setUp(self):
        Account.objects.create(user='keep_me', forLocation='Berlin',
                               status='Tracking')
        Account.objects.create(user='retired', forLocation='Mexico City',
                               status='Paused')

    def test_a_tracking_account_is_scraped(self):
        self.assertEqual(accounts_to_scrape(['keep_me']),
                         [{'user': 'keep_me', 'forLocation': 'Berlin'}])

    def test_a_paused_account_is_skipped(self):
        self.assertEqual(accounts_to_scrape(['retired']), [])

    def test_the_rest_of_the_batch_still_runs(self):
        # One retired account must not remove the others from the night.
        got = [a['user'] for a in accounts_to_scrape(['keep_me', 'retired'])]
        self.assertEqual(got, ['keep_me'])

    def test_an_unknown_username_is_still_passed_through(self):
        # Pre-existing behaviour worth keeping: a username with no Account row
        # is still handed to the scraper rather than silently dropped.
        self.assertEqual(accounts_to_scrape(['never_seen']),
                         [{'user': 'never_seen', 'forLocation': None}])

    def test_duplicate_rows_combine_their_locations(self):
        # Also pre-existing: the same handle can exist twice with different
        # cities, and both must reach the scraper.
        Account.objects.create(user='two_cities', forLocation='Bali',
                               status='Tracking')
        Account.objects.create(user='two_cities', forLocation='Berlin',
                               status='Tracking')
        got = accounts_to_scrape(['two_cities'])
        self.assertEqual(len(got), 1)
        self.assertEqual(sorted(got[0]['forLocation'].split(',')),
                         ['Bali', 'Berlin'])

    def test_a_handle_is_skipped_only_when_every_row_is_retired(self):
        # If one of the duplicate rows is still Tracking, the account is live.
        Account.objects.create(user='mixed', forLocation='Bali',
                               status='Paused')
        Account.objects.create(user='mixed', forLocation='Berlin',
                               status='Tracking')
        got = accounts_to_scrape(['mixed'])
        self.assertEqual(len(got), 1)
        # only the live row's location should be carried forward
        self.assertEqual(got[0]['forLocation'], 'Berlin')
