# Nullable track_feed / track_stories on Account. AUTO_APPLY-safe AddFields.
# Seed of existing rows is a separate RunPython migration (0014).

from django.db import migrations, models


class Migration(migrations.Migration):

    # Nullable extra columns; old readers ignore them. Opted in 2026-11-20 so
    # autodeploy can apply them with a verified SQLite backup.
    AUTO_APPLY = True

    dependencies = [
        ('c_admin', '0012_account_detail'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='track_feed',
            field=models.BooleanField(default=True, null=True),
        ),
        migrations.AddField(
            model_name='account',
            name='track_stories',
            field=models.BooleanField(default=False, null=True),
        ),
    ]
