"""Put a few made-up events into the LOCAL database so the site has something
to show.

A fresh clone starts empty: every page says "No Events Found" and there is
nothing to click on, which makes a first session with an AI assistant (or a
first look at the admin pages) pointless. These rows are clearly labelled
"Demo:", carry fake Instagram links, and are upserted on their shortcode so
running this twice changes nothing.

Refuses to run unless EVENT_API_HOST points at this machine, which is how
`scripts/dev_setup.sh` marks a local checkout; the production server does not
set that variable at all.
"""
import os
from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from c_admin.models import Account
from event.models import Event, Venue

DEMO = [
    # city, venue, address, name, artist, genres, price, days ahead
    ('Mexico City', 'Departamento', 'Álvaro Obregón 154, Roma Norte',
     'Demo: Noche de Cumbia', 'Sonido Gallo Negro', 'cumbia, tropical', '250', 1),
    ('Mexico City', 'Foro Indie Rocks', 'Zacatecas 39, Roma Norte',
     'Demo: Indie Thursday', 'Little Jesus', 'indie, rock', '350', 4),
    ('Mexico City', 'Yu Yu', 'Álvaro Obregón 157',
     'Demo: Late Night Techno', 'Konstantin', 'techno', '300', 8),
    ('Los Angeles', 'The Echo', '1822 Sunset Blvd',
     'Demo: Echo Park Sessions', 'Chicano Batman', 'psych, soul', '25', 2),
    ('Los Angeles', 'Sound Nightclub', '1642 N Las Palmas Ave',
     'Demo: House Saturday', 'Honey Dijon', 'house', '40', 5),
    ('Berlin', 'Renate', 'Alt-Stralau 70',
     'Demo: Garden Day', 'Atomlui', 'house, disco', '15', 3),
    ('Berlin', 'about blank', 'Markgrafendamm 24c',
     'Demo: Open Air', 'Ellen Allien', 'techno', '18', 6),
    ('Bali', 'Savaya', 'Jl. Belong Dua, Uluwatu',
     'Demo: Sunset Techno', 'Stephan Bodzin', 'techno, melodic', '350000', 2),
    ('Bali', 'Attika', 'Jl. Pantai Batu Bolong, Canggu',
     'Demo: Nights at Attika', 'Manu-L', 'house, dance', '150000', 7),
    ('Bali', 'Old Man\'s', 'Jl. Pantai Batu Bolong, Canggu',
     'Demo: Beer Pong Wednesday', None, 'party', 'Free', 9),
]


def _is_local(host):
    host = (host or '').lower()
    return any(h in host for h in ('127.0.0.1', 'localhost', '0.0.0.0'))


class Command(BaseCommand):
    help = "Insert a few labelled demo events into the local database (idempotent)."

    def handle(self, *args, **opts):
        if not _is_local(os.getenv('EVENT_API_HOST')):
            raise CommandError(
                'Refusing: EVENT_API_HOST is not set to this machine. This '
                'command is for a local development database only.')

        made = updated = 0
        for city, venue, address, name, artist, genres, price, days in DEMO:
            shortcode = 'DEMO%02d' % (DEMO.index((city, venue, address, name,
                                                  artist, genres, price, days)) + 1)
            day = timezone.localdate() + timedelta(days=days)
            start = timezone.make_aware(datetime.combine(day, time(21, 0)))
            account, _ = Account.objects.get_or_create(
                user='demo_%s' % city.lower().replace(' ', ''),
                defaults=dict(is_personal=False, created_by='demo',
                              forLocation=city, status='Tracking'))
            fields = dict(
                shortcode=shortcode, name=name, artist=artist, genres=genres,
                price=price, start_time='09:00 PM', start_date=start,
                is_event=True, is_duplicate=False, suppressed=False,
                forLocation=city, poster=account, timestamp=timezone.now(),
                orig_link='https://www.instagram.com/p/%s/' % shortcode,
                orig_thumb='https://placehold.co/600x600/1f1f1f/f5f0e8?text=%s'
                           % name.replace('Demo: ', '').replace(' ', '+'),
            )
            existing = Event.objects.filter(source_key='%s__0__0' % shortcode).first()
            if existing:
                for k, v in fields.items():
                    setattr(existing, k, v)
                existing.save()
                updated += 1
                continue
            fields['venue'] = Venue.objects.create(
                name=venue, address=address, city=city,
                country={'Mexico City': 'Mexico', 'Los Angeles': 'USA',
                         'Berlin': 'Germany', 'Bali': 'Indonesia'}[city])
            Event.objects.create(source_key='%s__0__0' % shortcode, **fields)
            made += 1
        self.stdout.write(self.style.SUCCESS(
            'demo events: %d created, %d refreshed' % (made, updated)))
