"""Reconstructed to match the production migration ledger. See 0008_feedback.py.

Adds Account.forLocation. Live column: "forLocation" varchar(255) NULL.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0009_rename_feedback_userfeedback'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='forLocation',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
