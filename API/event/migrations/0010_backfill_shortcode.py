"""Backfill Event.shortcode from the existing orig_link values.

Why this is needed
------------------
The batch scraper splits carousels into child image objects keyed
`{shortcode}__{slide}`, but only ever persists the *parent* post URL to
orig_link, so the slide identity is lost before it reaches the database
(verified: exactly 2 of 55,385 production rows encode a slide).

shortcode is the unit a post is actually identified by, and duplicate
detection blocks on it: 31,917 distinct posts currently occupy 55,272 rows,
i.e. 23,355 surplus rows from re-scrapes that the missing upsert allowed.

Note source_key is deliberately NOT backfilled. Its format is
`{shortcode}__{slide}__{slug}` and legacy rows have no slide information, so
inventing keys would either collide (a unique constraint spanning 23,355
duplicate rows) or fabricate identities that new ingestion could never
reproduce. Legacy rows keep source_key NULL and are resolved through the
EventMatch review flow instead.

Link shapes present in production:
    https://www.instagram.com/p/<shortcode>/        55,140 rows
    https://www.instagram.com/stories/<user>/<id>/     132 rows
    (empty)                                           113 rows
"""

import re

from django.db import migrations

POST_RE = re.compile(r'/(?:p|reel|tv)/([^/?#]+)')
STORY_RE = re.compile(r'/stories/[^/]+/(\d+)')


def extract_shortcode(orig_link):
    """Return the post shortcode for a link, or None if it has no usable id."""
    if not orig_link:
        return None
    story = STORY_RE.search(orig_link)
    if story:
        # Matches the scraper's own convention in normalize_apify_story_item_to_post_shape
        return f'story_{story.group(1)}'[:100]
    post = POST_RE.search(orig_link)
    if post:
        return post.group(1)[:100]
    return None


def backfill(apps, schema_editor):
    Event = apps.get_model('event', 'Event')
    batch, BATCH_SIZE = [], 2000
    qs = Event.objects.exclude(orig_link__isnull=True).exclude(orig_link='')
    for event in qs.only('id', 'orig_link', 'shortcode').iterator(chunk_size=BATCH_SIZE):
        code = extract_shortcode(event.orig_link)
        if code and code != event.shortcode:
            event.shortcode = code
            batch.append(event)
        if len(batch) >= BATCH_SIZE:
            Event.objects.bulk_update(batch, ['shortcode'])
            batch = []
    if batch:
        Event.objects.bulk_update(batch, ['shortcode'])


def unbackfill(apps, schema_editor):
    Event = apps.get_model('event', 'Event')
    Event.objects.exclude(shortcode__isnull=True).update(shortcode=None)


class Migration(migrations.Migration):

    dependencies = [
        ('event', '0009_ticket12_source_key_and_eventmatch'),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
