"""Reconstructed to match the production migration ledger. See 0008_feedback.py.

Creates GeocodingCache. Index names below are taken verbatim from the live
production database (Django's auto-generated names), NOT invented:

    c_admin_geo_address_728ace_idx
    c_admin_geo_cached__3292f8_idx

A previously committed hand-written 0008_geocodingcache.py created this same
model at position 0008 with different, invented index names. That file never
existed in production and made the repo undeployable (Django would have tried
to create an already-existing table); it has been removed in favour of this
faithful reconstruction at the position production actually used.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0010_account_forlocation'),
    ]

    operations = [
        migrations.CreateModel(
            name='GeocodingCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('address', models.TextField(unique=True)),
                ('latitude', models.FloatField()),
                ('longitude', models.FloatField()),
                ('formatted_address', models.TextField(blank=True, null=True)),
                ('place_id', models.CharField(blank=True, max_length=255, null=True)),
                ('cached_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AddIndex(
            model_name='geocodingcache',
            index=models.Index(fields=['address'], name='c_admin_geo_address_728ace_idx'),
        ),
        migrations.AddIndex(
            model_name='geocodingcache',
            index=models.Index(fields=['cached_at'], name='c_admin_geo_cached__3292f8_idx'),
        ),
    ]
