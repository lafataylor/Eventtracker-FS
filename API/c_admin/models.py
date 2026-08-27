from django.db import models

DETAIL_FIELD_CHOICES = [
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
]

DETAIL_MODE_CHOICES = [
    ('enforce', 'Enforce'),
    ('fallback', 'Fallback'),
]

class Account(models.Model):
    user = models.CharField(max_length=255, null=True)
    is_personal = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=255, null=True, default="Tracking")
    created_by = models.CharField(max_length=255, null=True)
    forLocation = models.CharField(max_length=255, null=True, blank=True)

class Logs(models.Model):
    scraped_at = models.CharField(max_length=255, null=True)
    scraped_by = models.CharField(max_length=255, null=True)
    number_of_new_events = models.IntegerField(null=True)
    accounts_list = models.CharField(max_length=255, null=True)
    execution_id = models.IntegerField(null=True)
    status = models.CharField(max_length=255, null=True)
    message = models.TextField(null=True)
    #number_of_accounts = models.IntegerField(null=True)

class LastRun(models.Model):
    account = models.CharField(max_length=255, null=True)
    last_run = models.CharField(max_length=255, null=True)
    
class Keywords(models.Model):
    col_name = models.CharField(max_length=30, primary_key=True)
    value = models.TextField(null=False)

class UserFeedback(models.Model):
    email = models.EmailField(max_length=255, null=True)
    first_name = models.CharField(max_length=255, null=True)
    last_name = models.CharField(max_length=255, null=True)
    text = models.TextField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)  # Adding timestamp

class AccountDetail(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='details')
    field_name = models.CharField(max_length=50, choices=DETAIL_FIELD_CHOICES)
    value = models.TextField()
    mode = models.CharField(max_length=10, choices=DETAIL_MODE_CHOICES, default='fallback')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('account', 'field_name')

    def __str__(self):
        return f"{self.account.user} | {self.field_name} ({self.mode})"


class GeocodingCache(models.Model):
    address = models.TextField(unique=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    formatted_address = models.TextField(null=True, blank=True)
    place_id = models.CharField(max_length=255, null=True, blank=True)
    cached_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['address']),
            models.Index(fields=['cached_at']),
        ]
