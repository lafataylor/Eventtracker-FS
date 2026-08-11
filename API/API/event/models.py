from django.db import models
from c_admin.models import Account
import datetime


class Venue(models.Model):
    name = models.CharField(max_length=255, null=True)
    address = models.CharField(max_length=255, null=True)
    city = models.CharField(max_length=50, null=True)
    state = models.CharField(max_length=50, null=True)
    country = models.CharField(max_length=50, null=True)


class Execution(models.Model):
    status = models.CharField(max_length=3, default="500")
    timestamp = models.DateTimeField(auto_now_add=True)


class Event(models.Model):
    exec = models.ForeignKey(Execution, on_delete=models.CASCADE, default=None, null=True)
    venue = models.ForeignKey(
        Venue, on_delete=models.CASCADE, default=None, null=True)
    poster = models.ForeignKey(
        Account, on_delete=models.CASCADE, default=None, null=True)
    name = models.CharField(max_length=255, null=True)
    artist = models.CharField(max_length=255, null=True)
    opener = models.CharField(max_length=255, null=True)
    host = models.CharField(max_length=255, null=True)
    promoter = models.CharField(max_length=255, null=True)
    offering = models.CharField(max_length=255, null=True)
    timestamp = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    start_date = models.DateTimeField(null=True)
    start_time = models.CharField(max_length=255, null=True)
    end_date = models.DateTimeField(null=True)
    end_time = models.CharField(max_length=255, null=True)
    #price = models.FloatField(default=0.0, null=True)
    price = models.CharField(max_length=255, null=True)
    ticket_link = models.CharField(max_length=255, null=True)
    is_age_restricted = models.BooleanField(default=False, null=True)
    orig_link = models.CharField(max_length=255, null=True)
    orig_thumb = models.CharField(max_length=255, null=True)
    is_event = models.BooleanField(default=False, null=True)
    age_barrier = models.CharField(max_length=255, null=True)
    late = models.BooleanField(default=False, null=True)
    link_in_bio = models.BooleanField(default=False, null=True)
    rsvp_required = models.BooleanField(default=False, null=True)
    num_events = models.IntegerField(default=1, null=True)
    genres = models.CharField(max_length=255, null=True)
    is_duplicate = models.BooleanField(default=False, null=True)
    duplicate_link = models.CharField(max_length=255, null=True)
    forLocation = models.CharField(max_length=255, null=True, blank=True)

class Feedback(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    changes = models.TextField(null=False)

class FavoritesData(models.Model):
    user_email = models.EmailField(max_length=255)
    events = models.ManyToManyField(Event, related_name='favorites', blank=True)


class BlacklistedLink(models.Model):
    url = models.CharField(max_length=255, unique=True)
    reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(Account, on_delete=models.SET_NULL, null=True, blank=True)
    
    def __str__(self):
        return self.url



