"""Reconstructed to match the production migration ledger.
See 0006_user_linked_accounts.py.

Renames linked_accounts -> linkedAccounts (live column: "linkedAccounts").
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('c_auth', '0006_user_linked_accounts'),
    ]

    operations = [
        migrations.RenameField(
            model_name='user',
            old_name='linked_accounts',
            new_name='linkedAccounts',
        ),
    ]
