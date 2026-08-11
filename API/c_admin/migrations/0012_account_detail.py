from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('c_admin', '0011_geocodingcache'),
    ]

    operations = [
        migrations.CreateModel(
            name='AccountDetail',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_name', models.CharField(
                    choices=[
                        ('venue_name', 'Venue Name'),
                        ('venue_city', 'City'),
                        ('venue_state', 'State'),
                        ('venue_country', 'Country'),
                        ('venue_address', 'Address'),
                        ('name', 'Event Name'),
                        ('artist', 'Artist'),
                        ('price', 'Price'),
                        ('age_barrier', 'Age Barrier'),
                        ('ticket_link', 'Ticket Link'),
                        ('forLocation', 'For Location'),
                        ('genres', 'Genres'),
                    ],
                    max_length=50
                )),
                ('value', models.TextField()),
                ('mode', models.CharField(
                    choices=[('enforce', 'Enforce'), ('fallback', 'Fallback')],
                    default='fallback',
                    max_length=10
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('account', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='details',
                    to='c_admin.account'
                )),
            ],
            options={
                'unique_together': {('account', 'field_name')},
            },
        ),
    ]

