"""Post-level ingestion for the manual add-by-URL path (Ticket 2, phase C).

The manual path (`create_event_from_instagram_link`) previously took only
`post_data["displayUrl"]` — one image — and never checked `type == "Sidecar"`,
so pasting a carousel URL could only ever produce a single event. The batch
path split carousels but then labelled each slide independently, so a slide
listing several events still collapsed into one.

This module does it once, correctly, for both callers:
  1. collect EVERY slide image of the post,
  2. mirror each to Firebase (Instagram CDN URLs expire, and the stored
     orig_thumb has to keep working),
  3. run ONE structured-output vision call over all slides,
  4. return one API payload per extracted event, carrying shortcode +
     source_slide_index so ingestion can upsert on source_key.

`slide_image_urls` is pure and unit-tested; the rest is I/O orchestration.
"""

import logging
import os

logger = logging.getLogger('django')

# Per-slide network budget for the request path. The scraper's
# @retry(stop_after_attempt(5), wait_fixed(15)) downloader is built for a
# background cron; across 20 carousel slides its worst case is many minutes,
# while the frontend's axios client gives up at 30s.
SLIDE_DOWNLOAD_TIMEOUT = 8


def fast_download(url, save_path, timeout=SLIDE_DOWNLOAD_TIMEOUT):
    """Single-attempt slide download, bounded so a request can't hang.

    Raises on failure; mirror_slides skips that slide and keeps the rest.
    """
    import requests

    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    with open(save_path, 'wb') as handle:
        handle.write(response.content)


def slide_image_urls(post_data):
    """Every image URL of an Apify Instagram post, in slide order.

    Handles the shapes the actor returns:
      * Sidecar (carousel): `images` (URL list) and/or `childPosts` (per-slide
        objects). childPosts is preferred when present because it carries
        per-slide metadata; `images` is the fallback the old scraper used.
      * Image / Video / story-normalised items: a single `displayUrl`.
    Falls back to displayUrl so a malformed carousel still yields one image
    rather than nothing.
    """
    if not isinstance(post_data, dict):
        return []

    urls = []
    for child in post_data.get('childPosts') or []:
        if isinstance(child, dict):
            url = child.get('displayUrl') or child.get('imageUrl')
            if url:
                urls.append(url)

    if not urls:
        for image in post_data.get('images') or []:
            if isinstance(image, str):
                urls.append(image)
            elif isinstance(image, dict):
                url = image.get('url') or image.get('displayUrl')
                if url:
                    urls.append(url)

    if not urls:
        display = post_data.get('displayUrl')
        if display:
            urls.append(display)

    # De-duplicate while preserving slide order.
    seen, ordered = set(), []
    for url in urls:
        if url not in seen:
            seen.add(url)
            ordered.append(url)
    return ordered


import re

# Same pattern migration 0010 uses to backfill shortcodes, so a URL parsed here
# yields the identical shortcode that path produces.
_POST_RE = re.compile(r'/(?:p|reel|tv)/([^/?#]+)')
_STORY_RE = re.compile(r'/stories/[^/]+/(\d+)')


def post_shortcode(post_data):
    """The post's Instagram shortcode under any of the actor's key spellings."""
    if not isinstance(post_data, dict):
        return None
    return (post_data.get('shortCode') or post_data.get('shortcode')
            or post_data.get('code') or None)


def split_child_shortcode(filename):
    """Split the scraper's per-image key into (shortcode, slide_index).

    process_post names carousel slides "{shortcode}__{idx}" (and single-image
    posts just "{shortcode}"), but that identity was only ever used for local
    filenames — it never reached the database, which is why re-scrapes could
    not be deduplicated. Returning it lets the batch path send shortcode +
    sourceSlideIndex so AdminEvent.post upserts instead of inserting.

    Shortcodes themselves can contain "__" (e.g. "DC2LX__qOJ3"), so only a
    trailing all-digit segment counts as a slide index.
    """
    if not filename:
        return None, None
    parent, sep, tail = str(filename).rpartition('__')
    if sep and parent and tail.isdigit():
        return parent, int(tail)
    return str(filename), None


def shortcode_from_url(url):
    """Parse a shortcode out of an Instagram URL.

    Must strip query strings and fragments: share links carry `?igsh=...`, and
    a naive split on '/' would fold that into the shortcode, producing a
    different source_key every time and defeating the upsert.
    """
    if not url:
        return None
    story = _STORY_RE.search(url)
    if story:
        return f'story_{story.group(1)}'[:100]
    post = _POST_RE.search(url)
    return post.group(1)[:100] if post else None


def mirror_slides(urls, *, exec_id, user, output_file_path, downloader, uploader,
                  limit=20):
    """Download each slide and mirror it to durable storage.

    Returns (durable_urls, original_urls) for the slides that succeeded. A slide
    that fails is skipped rather than aborting the post — partial extraction
    beats none. `limit` matches Instagram's 20-slide carousel maximum.

    Callers on a request path should pass a downloader WITHOUT long retries:
    the scraper's retry(5, wait 15s) across 20 slides can block a worker for
    tens of minutes, far past the frontend's 30s timeout.

    A uuid is mixed into the temp path because the caller's name is only
    second-resolution — two concurrent manual adds in the same second would
    otherwise overwrite each other's slide files.
    """
    import uuid
    run_id = uuid.uuid4().hex[:8]

    durable, originals = [], []
    for index, url in enumerate(urls[:limit]):
        local_path = f"/tmp/{output_file_path}_{run_id}_{index}.jpg"
        try:
            downloader(url, local_path)
            hosted = uploader(exec_id, user, f"{output_file_path}_{run_id}_{index}",
                              local_path, url)
            if hosted:
                durable.append(hosted)
                originals.append(url)
        except Exception as exc:  # noqa: BLE001 — one bad slide must not kill the post
            logger.warning("[CAROUSEL] slide %s mirror failed for %s: %s",
                           index, output_file_path, exc)
        finally:
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except OSError:
                pass
    return durable, originals


def build_payloads(extraction, *, shortcode, post_link, slide_urls,
                   for_location=None, poster=None):
    """Map a PostExtraction to AdminEvent.post payloads, one per event.

    Each payload carries shortcode + sourceSlideIndex; AdminEvent.post derives
    the positional source_key from those and upserts, so re-scrapes update in
    place instead of inserting duplicates.
    """
    from .extraction import expand_recurring, to_api_payload

    # Recurring series become one event per date (product owner's requirement).
    payloads = []
    for ordinal, event in enumerate(expand_recurring(extraction.events)):
        slide = event.source_slide_index
        if slide is not None and 0 <= slide < len(slide_urls):
            image_url = slide_urls[slide]
        else:
            image_url = slide_urls[0] if slide_urls else None
        payloads.append(to_api_payload(
            event,
            shortcode=shortcode,
            slide_index=slide,
            ordinal=ordinal,
            post_link=post_link,
            image_url=image_url,
            for_location=for_location,
            poster=poster,
        ))
    return payloads


def group_slides_by_post(images_for_account):
    """Group an account's scraped images back into posts.

    The batch scraper flattens a post's carousel into separate entries keyed
    "{shortcode}__{idx}" and then labels each one independently — which is why
    a slide listing several events collapses into one, and why one event shown
    across several slides can become several events.

    Grouping prefers the entry's `link`, which process_post sets to the real
    parent post URL. Filename parsing is only the fallback: an Instagram
    shortcode may itself end in "__<digits>" (the alphabet includes digits and
    underscores), and splitting on that would merge two unrelated posts into a
    single vision call.

    Returns {shortcode: [(filename, image_dict, slide_index), ...]} with each
    post's slides in slide order, so the caller can run ONE extraction over the
    whole post the way the manual add-by-URL path does.
    """
    grouped = {}
    for filename, image in (images_for_account or {}).items():
        parsed, slide = split_child_shortcode(filename)
        from_link = shortcode_from_url((image or {}).get('link'))
        shortcode = from_link or parsed
        if not shortcode:
            continue
        grouped.setdefault(shortcode, []).append((filename, image, slide))
    for slides in grouped.values():
        # None (single-image post) sorts before real slide indexes.
        slides.sort(key=lambda entry: (entry[2] is not None, entry[2] or 0))
    return grouped
