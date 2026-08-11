# Generated manually for GeocodingCache model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0007_lastrun_and_more'),
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
            options={
                'indexes': [
                    models.Index(fields=['address'], name='c_admin_geoc_address_123456_idx'),
                    models.Index(fields=['cached_at'], name='c_admin_geoc_cached_123456_idx'),
                ],
            },
        ),
    ] 