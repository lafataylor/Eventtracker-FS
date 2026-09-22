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

A generic title ("Happy Hour") at two venues on one night still only
FLAGS: it must reach a human, not vanish. Same place plus the same
start time, or a near-title OCR typo at one room, is now strong enough
to auto-merge — those were the owner's 2026-09-22 screenshots.
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

    def test_same_place_same_day_same_start_time_is_auto_merged(self):
        # Owner 2026-09-22: four Tonalá 308 bazaar cards and three Poppy
        # Lounge workshop cards — different titles, same place, same clock
        # time. Flag-only left them on the public feed.
        a = self._ev('This Week', 'POSTA', venue='High Fidelity Sound Bar', start_time='07:00 PM')
        b = self._ev('Menu at High Fidelity', 'POSTB', venue='High Fidelity Sound Bar', start_time='07:00 PM')
        self._run()
        a.refresh_from_db(); b.refresh_from_db()
        hidden = [e for e in (a, b) if e.suppressed]
        self.assertEqual(len(hidden), 1)
        self.assertEqual(EventMatch.objects.filter(status='confirmed').count(), 1)

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

    def _visible(self, *events):
        alive = []
        for e in events:
            e.refresh_from_db()
            if not e.suppressed:
                alive.append(e)
        return alive

    def test_poppy_lounge_workshop_cluster_auto_merges(self):
        # Owner screenshot 2026-09-22: three cards, one 6pm workshop.
        a = self._ev('Paint & Sound Workshop', 'POP1', venue='Poppy Lounge',
                     start_time='6:00 PM')
        b = self._ev('Workshop at Poppy Wellness Lounge', 'POP2',
                     venue='Poppy Wellness Lounge', start_time='6:00 PM')
        c = self._ev('poppywellnesslounge', 'POP3', venue='Poppy Wellness Lounge',
                     start_time='6:00 PM')
        self._run()
        self.assertEqual(len(self._visible(a, b, c)), 1)

    def test_tonala_vintage_bazaar_cluster_auto_merges(self):
        # Owner screenshot 2026-09-22: four differently titled posts of one
        # market at Tonalá 308, same weekend, same 11am start.
        rows = [
            self._ev('Las joyitas de Otoño Vintage Market', 'BAZ1',
                     venue=None, address='Tonalá 308', start_time='11:00 AM'),
            self._ev('Bazar de Ropa Segunda Mano y Vintage', 'BAZ2',
                     venue=None, address='Tonalá 308', start_time='11:00 AM'),
            self._ev('Paraíso Vintage', 'BAZ3',
                     venue=None, address='Tonalá 308', start_time='11:00 AM'),
            self._ev('Adiós clóset', 'BAZ4',
                     venue=None, address='Tonalá 308 Roma Sur', start_time='11:00 AM'),
        ]
        self._run()
        self.assertEqual(len(self._visible(*rows)), 1)

    def test_alex_isley_ocr_typo_at_the_same_club_auto_merges(self):
        # Owner screenshot 2026-09-22: "Alexis Ley" vs "Alex Isley at Blue
        # Note LA" — same artist, same room; the extractor misspelled the name.
        a = self._ev('Alexis Ley', 'ALX1', venue='Blue Note')
        b = self._ev('Alex Isley at Blue Note LA', 'ALX2', venue='Blue Note LA')
        self._run()
        self.assertEqual(len(self._visible(a, b)), 1)

    def test_near_titles_on_the_same_day_are_flagged_even_when_the_venue_differs(self):
        # Owner 2026-09-22: "title match could be more loose". token_sort of
        # these is ~72, under the old 85 same-title bar, so a second post of
        # one night never reached review when the venue strings also disagreed.
        # Still FLAG only: two rooms might both be hosting a sunset rave.
        a = self._ev('Sunset Rave at Foro', 'RAV1', venue='Foro Uno',
                     address='Tonalá 23', city='Roma')
        b = self._ev('Sunset Rave Night', 'RAV2', venue='Main Hall Guapa',
                     address='Av. Insurgentes Sur 1391', city='Ciudad de México')
        self._assert_the_old_rule_misses(a, b)
        self._run()
        self.assertTrue(self._pending(a, b))
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_word_order_titles_at_one_place_auto_merge(self):
        # token_sort ~67: not a subset, under the old leftover-60 and
        # same-title-85 bars. Same room, same day, no conflicting times.
        a = self._ev('Cumbia Night', 'CUM1', venue='Salón Los Ángeles')
        b = self._ev('Noche de Cumbia', 'CUM2', venue='Salon Los Angeles')
        self._assert_the_old_rule_misses(a, b)
        self._run()
        self.assertEqual(len(self._visible(a, b)), 1)

    def test_the_same_flyer_on_the_same_day_is_flagged_even_when_text_differs(self):
        # Image matching: two posts of one artwork, titles and rooms disagree.
        # FLAG only — a shared template at two venues is a human decision.
        # Measured 2026-09-19: about 3 in 100 candidates share artwork.
        h = 'a1b2c3d4e5f60718'
        a = self._ev('Workshop One', 'FLY1', venue='Studio A', image_dhash=h)
        b = self._ev('Something Else Entirely', 'FLY2', venue='Hall B',
                     address='Insurgentes 1391', city='CDMX', image_dhash=h)
        self._assert_the_old_rule_misses(a, b)
        self._run()
        self.assertTrue(self._pending(a, b))
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)

    def test_near_identical_flyer_hashes_still_flag(self):
        # 3 bits: JPEG recompress / resize stay inside 6 (test_imagehash).
        a = self._ev('Alpha Night', 'NEAR1', venue='Club Uno',
                     image_dhash='0000000000000000')
        b = self._ev('Beta Party', 'NEAR2', venue='Club Dos',
                     address='Juárez 70', image_dhash='0000000000000007')
        self._assert_the_old_rule_misses(a, b)
        self._run()
        self.assertTrue(self._pending(a, b))

    def test_distinct_flyer_hashes_are_left_alone(self):
        # 13 bits: past the 6-bit same-image bar; different flyers measure
        # 24-33 (2026-09-19). Titles and rooms also disagree.
        a = self._ev('Alpha Night', 'FAR1', venue='Club Uno',
                     image_dhash='0000000000000000')
        b = self._ev('Beta Party', 'FAR2', venue='Club Dos',
                     address='Juárez 70', image_dhash='0000000000001fff')
        self._run()
        self.assertEqual(EventMatch.objects.count(), 0)

    def test_the_same_flyer_a_week_apart_is_not_flagged(self):
        # Same image on another day is a series, not a duplicate.
        h = 'a1b2c3d4e5f60718'
        a = self._ev('Weekly', 'SER1', venue='Oxi', image_dhash=h)
        b = self._ev('Weekly', 'SER2', venue='Oxi Club',
                     day=self.day + timedelta(days=7), image_dhash=h)
        self._run()
        self.assertFalse(self._pending(a, b))
