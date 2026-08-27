"""Reconstructed to match the production migration ledger.

The original file for this migration was never committed to the repository
(git history did not survive the handoff). Its name and position are taken
verbatim from production's django_migrations table, and its operations are
reconstructed from the live production schema.

Production created a `Feedback` model here, which 0009 then renamed to
`UserFeedback` (final table: c_admin_userfeedback). Field definitions match
the live table exactly:

    CREATE TABLE "c_admin_userfeedback" (
        "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        "email" varchar(255) NULL, "first_name" varchar(255) NULL,
        "last_name" varchar(255) NULL, "text" text NULL,
        "created_at" datetime NOT NULL)
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0007_lastrun_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Feedback',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=255, null=True)),
                ('first_name', models.CharField(max_length=255, null=True)),
                ('last_name', models.CharField(max_length=255, null=True)),
                ('text', models.TextField(null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
