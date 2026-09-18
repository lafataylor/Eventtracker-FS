"""A wider net for the review page: similar title, or same place, same day.

Owner, 2026-09-18: "I'm also seeing a bunch of duplicates on the front end
that I feel like should be being caught. Can we set it up so it flags
anything with a similar image, similar title or similar location and date?"

Measured on production that evening (rows the nightly pass had already seen):
43 same-day pairs with near-identical titles were unflagged, ALL from one
account posting the same event twice; when the extractor writes the venue
differently on the two posts, the venue mismatch drags the fused score to
about 78, under the 82 bar. Another 178 shared a place and a day with a
missing title, the same start time, or a loosely similar title. Together
they touched 355 of 2,427 visible upcoming events. 201 more pairs shared a
place and a day but had different titles AND different times: those are
mostly different shows at one venue, and are deliberately NOT flagged.

The wide net only ever FLAGS. It never merges: a generic title ("Happy
Hour") at two venues on one night must reach a human, not vanish.
"""
from datetime import datetime, time, timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from c_admin.models import Account
from .models import Event, EventMatch, Venue


class WideNetTests(TestCase):
    def setUp(self):
        self.day = timezone.localdate() + timedelta(days=6)
        self.acct = Account.objects.create(user='one_account', forLocation='Berlin')

    def _ev(self, name, post, venue=None, address=None, city=None, day=None, hour=21,
            start_time=None, **kw):
        when = timezone.make_aware(datetime.combine(day or self.day, time(hour, 0)))
        base = dict(name=name, shortcode=post, start_date=when, start_time=start_time,
                    orig_link='https://www.instagram.com/p/%s/' % post, poster=self.acct,
                    is_event=True, is_duplicate=False, suppressed=False,
                    venue=Venue.objects.create(name=venue, address=address, city=city))
        base.update(kw)
        return Event.objects.create(**base)

    def _assert_the_old_rule_misses(self, a, b):
        # Guard: the fixture must reproduce the production miss, or the test
        # proves nothing about the wide net.
        from event.dedupe import FUZZY_THRESHOLD, event_signature, score_pair
        a = Event.objects.select_related('venue').get(id=a.id)
        b = Event.objects.select_related('venue').get(id=b.id)
        s = score_pair(event_signature(a), event_signature(b))
        self.assertLess(s, FUZZY_THRESHOLD, f'fixture scores {s}: the old rule already catches it')

    def _run(self):
        call_command('detect_duplicates', '--fuzzy', '--auto-merge-threshold', '95')

    def _pending(self, a, b):
        return EventMatch.objects.filter(event_a__in=[a, b], event_b__in=[a, b], status='pending').exists()

    def test_the_same_title_on_the_same_day_is_flagged_even_when_the_venue_text_differs(self):
        a = self._ev('PIÑATA POP VOL. 5', 'POSTA', venue='Piñata Pop', city='CDMX')
        b = self._ev('PIÑATA POP VOL. 5', 'POSTB', venue='Main Hall Guapa',
                     address='Av. Insurgentes Sur 1391', city='Ciudad de México')
        self._assert_the_old_rule_misses(a, b)
        self._run()
        self.assertTrue(self._pending(a, b))

    def test_the_wide_net_never_merges_by_itself(self):
        a = self._ev('Happy Hour', 'POSTA', venue='Bar Uno', address='Tonalá 23', city='Roma Norte')
        b = self._ev('Happy Hour', 'POSTB', venue='Cantina Dos', address='Av. Juárez 70', city='Centro')
        self._assert_the_old_rule_misses(a, b)
        self._run()
        self.assertTrue(self._pending(a, b))
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_same_place_same_day_with_an_untitled_side_is_flagged(self):
        a = self._ev(None, 'POSTA', venue='Savaya', artist='Diplo')
        b = self._ev('Diplo at Savaya', 'POSTB', venue='Savaya Bali')
        self._run()
        self.assertTrue(self._pending(a, b))

    def test_same_place_same_day_same_start_time_is_flagged(self):
        a = self._ev('This Week', 'POSTA', venue='High Fidelity Sound Bar', start_time='07:00 PM')
        b = self._ev('Menu at High Fidelity', 'POSTB', venue='High Fidelity Sound Bar', start_time='07:00 PM')
        self._run()
        self.assertTrue(self._pending(a, b))

    def test_two_different_shows_at_one_venue_are_left_alone(self):
        a = self._ev('Indietanzbar', 'POSTA', venue='Bohnengold', start_time='11:00 PM')
        b = self._ev('Booze Night', 'POSTB', venue='Bohnengold', start_time='07:00 PM')
        self._run()
        self.assertEqual(EventMatch.objects.count(), 0)

    def test_the_venues_own_name_in_both_titles_is_not_a_similar_title(self):
        # Rehearsal on production data, 2026-09-18: these two different
        # nights were flagged as "similar titles" only because both titles
        # end in the venue's name. At one place, the place's name is not
        # evidence; what is left of the titles has to agree.
        a = self._ev('Indietanzbar at Bohnengold', 'POSTA', venue='Bohnengold', start_time='11:00 PM')
        b = self._ev('Booze Night at Bohnengold', 'POSTB', venue='Bohnengold', start_time='07:00 PM')
        self._run()
        self.assertEqual(EventMatch.objects.count(), 0)

    def test_a_real_loose_match_at_one_place_still_flags(self):
        a = self._ev('Dekmantel x Potato Head with Ogazón', 'POSTA', venue='Potato Head', start_time='04:00 PM')
        b = self._ev('Dekmantel x Potato Head Bali', 'POSTB', venue='Potato Head Beach Club', start_time='05:00 PM')
        self._run()
        self.assertTrue(self._pending(a, b))

    def test_a_title_that_is_only_a_subset_is_not_the_same_title(self):
        # token_set_ratio says 100 for a subset; the wide net must not.
        a = self._ev('Kvadrat', 'POSTA', venue='Showroom One', start_time='10:00 AM')
        b = self._ev('High Tide, Kvadrat, Billings, Henrybuilt', 'POSTB', venue='Design Fair', start_time='06:00 PM')
        self._run()
        self.assertEqual(EventMatch.objects.count(), 0)

    def test_the_same_title_a_week_apart_is_not_flagged(self):
        a = self._ev('Techno Tuesday', 'POSTA', venue='Oxi')
        b = self._ev('Techno Tuesday', 'POSTB', venue='Oxi Club', day=self.day + timedelta(days=7))
        self._run()
        self.assertFalse(self._pending(a, b))

    def test_the_day_is_the_local_day(self):
        # A date-only row sits at local midnight; an evening row of the SAME
        # local day is already the next day in UTC. Same day for a visitor.
        a = self._ev('Noche de Cumbia', 'POSTA', venue='Foro Uno', address='Tonalá 23', city='Roma', hour=0)
        b = self._ev('Noche de Cumbia', 'POSTB', venue='Salón Los Ángeles', address='Lerdo 206', city='Guerrero', hour=21)
        self._assert_the_old_rule_misses(a, b)
        self._run()
        self.assertTrue(self._pending(a, b))

    def test_an_owner_verdict_is_never_reopened(self):
        a = self._ev('PIÑATA POP VOL. 5', 'POSTA', venue='Piñata Pop')
        b = self._ev('PIÑATA POP VOL. 5', 'POSTB', venue='Main Hall Guapa')
        lo, hi = sorted((a, b), key=lambda e: e.id)
        EventMatch.objects.create(event_a=lo, event_b=hi, score=85, match_type='fuzzy',
                                  status='rejected', reviewed_at=timezone.now())
        self._run()
        self.assertEqual(EventMatch.objects.get(event_a=lo, event_b=hi).status, 'rejected')
