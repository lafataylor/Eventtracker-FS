"""Reconstructed to match the production migration ledger.

Name and position taken verbatim from production's django_migrations table;
operations reconstructed from the live schema. Adds the duplicate-tracking
fields (the columns Ticket 1 builds on) and the BlacklistedLink model:

    "duplicate_link" varchar(255) NULL
    "is_duplicate" bool NULL
    CREATE TABLE "event_blacklistedlink" (
        "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        "url" varchar(255) NOT NULL UNIQUE, "reason" text NULL,
        "created_at" datetime NOT NULL,
        "created_by_id" bigint NULL REFERENCES "c_admin_account" ("id"))
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0012_account_detail'),
        ('event', '0006_event_age_barrier_event_end_date_event_end_time_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='duplicate_link',
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='event',
            name='is_duplicate',
            field=models.BooleanField(default=False, null=True),
        ),
        migrations.CreateModel(
            name='BlacklistedLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url', models.CharField(max_length=255, unique=True)),
                ('reason', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='c_admin.account')),
            ],
        ),
    ]
