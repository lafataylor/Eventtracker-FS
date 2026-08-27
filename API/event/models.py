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

    # --- Ticket 2: stable source identity for carousel slides ---
    # source_key is "{shortcode}__{slide_index}__{slug}" and is what ingestion
    # upserts on, so re-scraping a post updates rows instead of inserting new
    # ones. Nullable + unique: the 55,385 pre-existing rows have NULL here, and
    # SQLite permits many NULLs in a unique index. Backfilled separately.
    source_key = models.CharField(max_length=300, unique=True, null=True, blank=True)
    # Parent Instagram post shortcode. Distinct from source_key: every slide of
    # one carousel shares a shortcode but has its own source_key.
    shortcode = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    # Which carousel slide this event came from (NULL for single-image posts).
    source_slide_index = models.IntegerField(null=True, blank=True)

    # --- Ticket 1: duplicate resolution ---
    # When the owner keeps A over B, B gets suppressed=True and canonical=A.
    # Suppression is reversible by design — the existing dedupe over-flagged
    # badly, so nothing is destroyed on a duplicate verdict.
    canonical = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='variants')
    suppressed = models.BooleanField(default=False, db_index=True)


class EventMatch(models.Model):
    """A candidate duplicate pair, surfaced for side-by-side owner review.

    Replaces the old `duplicate_link` string, which stored only a URL (and
    sometimes "database_event_{id}", not a URL at all) and so could never
    support comparing two events.

    Invariant: event_a_id < event_b_id, enforced by the detection code, so a
    pair is stored once rather than as both (A,B) and (B,A).
    """

    MATCH_TYPES = [
        ('exact_link', 'Identical source link'),
        ('fuzzy', 'Fuzzy text match'),
        ('phash', 'Perceptual image hash'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending review'),
        ('confirmed', 'Confirmed duplicate'),
        ('rejected', 'Not a duplicate'),
    ]

    event_a = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='matches_as_a')
    event_b = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='matches_as_b')
    score = models.FloatField(help_text='0-100 fused similarity score')
    match_type = models.CharField(max_length=20, choices=MATCH_TYPES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('event_a', 'event_b')
        indexes = [
            models.Index(fields=['status', '-score']),
        ]

    def __str__(self):
        return f"{self.event_a_id} ~ {self.event_b_id} ({self.match_type} {self.score:.0f})"

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



