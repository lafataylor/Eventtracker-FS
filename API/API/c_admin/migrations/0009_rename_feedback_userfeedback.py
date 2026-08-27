"""Reconstructed to match the production migration ledger. See 0008_feedback.py.

Renames Feedback -> UserFeedback (table c_admin_feedback -> c_admin_userfeedback).
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0008_feedback'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='Feedback',
            new_name='UserFeedback',
        ),
    ]
