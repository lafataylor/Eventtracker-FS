"""Reconstructed to match the production migration ledger.

Production applied 0006_user_linked_accounts followed by
0007_rename_linked_accounts_user_linkedaccounts. Final live column is
"linkedAccounts" varchar(255) NULL, so this migration adds the snake_case
field and 0007 renames it to the camelCase name the model uses.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('c_auth', '0005_user_description_user_firstname_user_lastname_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='linked_accounts',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
