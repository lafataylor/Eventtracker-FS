"""Reconstructed to match the production migration ledger.
See 0007_event_duplicate_link_event_is_duplicate_and_more.py.

Adds Event.forLocation. Live column: "forLocation" varchar(255) NULL.
This is the city-scoping field (values in production include "Mexico City",
"Los Angeles", "Berlin", "Bali", plus unnormalised variants).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('event', '0007_event_duplicate_link_event_is_duplicate_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='forLocation',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
