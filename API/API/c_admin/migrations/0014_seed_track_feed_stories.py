"""Seed track_feed / track_stories on existing Account rows.

Not AUTO_APPLY: RunPython is not on the safe-ops list. Deploy will STOP and
need a person to apply this once. 2026-11-20.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    from c_admin.track_flags import seed_track_flags

    Account = apps.get_model('c_admin', 'Account')
    seed_track_flags(Account)


def backwards(apps, schema_editor):
    Account = apps.get_model('c_admin', 'Account')
    Account.objects.all().update(track_feed=None, track_stories=None)


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0013_account_track_feed_stories'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
