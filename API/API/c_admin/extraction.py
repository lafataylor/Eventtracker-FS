"""Structured-output event extraction (Ticket 2).

The old pipeline labelled one image at a time with a free-text prompt whose
`subEvents` field was requested but never parsed. Two failure modes followed:

  * a single event promoted across N carousel slides became N events;
  * a slide listing several events collapsed into one.

This module treats the POST as the unit. All of a post's slide images go to one
vision call that returns, via OpenAI Structured Outputs (strict JSON schema,
~100% array compliance), a `post_type` classification plus an `events` array
with a `source_slide_index` per event. The caller upserts that array on
`source_key`, so re-scrapes never duplicate (Ticket 1 foundation).

The extractor is dependency-injected with the OpenAI client so the whole
parse -> map -> payload flow can be tested offline with a mock, spending
nothing. Real API calls happen only when a caller passes a live client.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# gpt-4.1-mini is what the old code used and it supports vision + structured
# outputs. 16k output tokens (vs the old 4k) so multi-event JSON never truncates.
DEFAULT_MODEL = "gpt-4.1-mini"
MAX_OUTPUT_TOKENS = 16000


class ExtractedEvent(BaseModel):
    """One event extracted from a post. All fields required (strict mode);
    absence is expressed as null / empty list, never a missing key."""
    is_event: bool = Field(description="True only if this describes a real, attendable event.")
    event_name: Optional[str]
    artists: List[str]
    openers: List[str]
    hosts: List[str]
    promoters: List[str]
    offerings: List[str]
    genres: Optional[str] = Field(description="Comma-separated genres, or null.")
    start_date: Optional[str] = Field(description="MM-DD-YYYY, or null if not found.")
    end_date: Optional[str] = Field(description="MM-DD-YYYY, or null.")
    start_time: Optional[str] = Field(description="HH:MM AM/PM, or null.")
    end_time: Optional[str] = Field(description="HH:MM AM/PM, or null.")
    venue: Optional[str] = Field(description="Venue name only (no city/state/country).")
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    overall_address: Optional[str] = Field(description="Full human-readable address.")
    price: Optional[str] = Field(description="Price incl. currency symbol, or null.")
    currency: Optional[str] = Field(description="e.g. MXN, USD, EUR, or null.")
    age_barrier: Optional[str] = Field(description="e.g. 18+, 21+, or null.")
    ticket_link: Optional[str]
    late: bool
    link_in_bio: bool
    rsvp_required: bool
    source_slide_index: Optional[int] = Field(
        description="0-based index of the carousel slide this event came from, "
                    "or null for a single-image post.")
    recurrence: Optional[str] = Field(
        description="For a repeating series, how often it repeats: 'weekly', "
                    "'biweekly', or 'monthly'. Null for a one-off event.")
    recurrence_until: Optional[str] = Field(
        description="MM-DD-YYYY the series ends, if the post states one. Null "
                    "if open-ended.")


class PostExtraction(BaseModel):
    """The whole post. post_type is the guardrail that stops an N-slide single
    event from becoming N events."""
    post_type: Literal["single", "roundup", "recurring"] = Field(
        description="'single' = one event (possibly shown across many slides); "
                    "'roundup' = several distinct events in one post; "
                    "'recurring' = one repeating series.")
    events: List[ExtractedEvent]


PROMPT = """\
You are extracting event information from an Instagram post for a nightlife/events \
listing site. You are given ALL images of the post (a post may be a single image or \
a multi-slide carousel), plus the caption and the account's Instagram bio.

Return a PostExtraction:

1) Classify post_type:
   - "single": ONE event. Common even with many slides (a flyer + lineup + venue \
photos are all the SAME event). Return exactly ONE event.
   - "roundup": SEVERAL DIFFERENT events in one post (e.g. a "this weekend" list, \
or one event per slide). Return one entry PER distinct event.
   - "recurring": one event that repeats (e.g. "every Thursday"). Return ONE entry \
describing the series, with start_date set to the FIRST occurrence and \
recurrence set to weekly/biweekly/monthly (the server expands it into one event \
per date). Set recurrence_until only if the post states an end date.
   Do NOT split a single event into multiple events just because it spans slides.

2) For each event set source_slide_index to the 0-based slide it came from \
(null for a single-image post). If a roundup lists events in the caption rather than \
per-slide, use the slide that best depicts each, else null.

Date rules (apply strictly):
- The current year is 2026.
- NEVER default to October. If no date is found, return null for start_date. The \
only acceptable forced fallback is 01-01-2026.
- Spanish months: enero=Jan, febrero=Feb, marzo=Mar, abril=Apr, mayo=May, junio=Jun, \
julio=Jul, agosto=Aug, septiembre/setiembre=Sep, octubre=Oct, noviembre=Nov, \
diciembre=Dec. "9 de abril" = April 9.
- European events (Spain, France, Germany, Italy, Netherlands, Portugal, Belgium, \
Switzerland, Austria, Poland, UK, Ireland, Nordics, Greece, Czechia, Hungary, \
Romania): interpret ambiguous numeric dates as DD/MM/YYYY. "9/4/2026" = April 9.
- At 12 AM a new day starts; use start/end times to infer end_date when needed.

Populate venue with the venue name only (strip city/state/country into their own \
fields). link_in_bio is true only if the image/caption says something like "link in \
bio" (ignore the bio for that flag). If link_in_bio is true, use the bio URL as \
ticket_link.

Caption:
{caption}

Instagram bio:
{biography} {external_url}
"""


def build_messages(image_urls, caption, biography, external_url):
    """One vision message containing the prompt and every slide image."""
    content = [{
        "type": "text",
        "text": PROMPT.format(
            caption=caption or "",
            biography=biography or "",
            external_url=external_url or ""),
    }]
    for url in image_urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    return [{"role": "user", "content": content}]


def extract_events(client, image_urls, caption="", biography="", external_url="",
                   model=DEFAULT_MODEL):
    """Call OpenAI Structured Outputs and return a validated PostExtraction.

    `client` is injected so tests can mock it. Raises on API/parse failure so the
    caller decides how to handle it (the old code swallowed everything).
    """
    completion = client.beta.chat.completions.parse(
        model=model,
        messages=build_messages(image_urls, caption, biography, external_url),
        response_format=PostExtraction,
        max_tokens=MAX_OUTPUT_TOKENS,
    )
    choice = completion.choices[0]
    parsed = choice.message.parsed
    if parsed is None:
        # parsed is None on a refusal or when the response hit the token limit.
        # Raise rather than return None, so callers don't AttributeError deep in
        # payload building with no idea why.
        refusal = getattr(choice.message, 'refusal', None)
        raise ValueError(
            f"Extraction returned no parsed output "
            f"(finish_reason={getattr(choice, 'finish_reason', None)!r}, "
            f"refusal={refusal!r})")
    return parsed


RECURRENCE_STEPS = {'weekly': 7, 'biweekly': 14, 'monthly': 30}
MAX_OCCURRENCES = 12  # ~3 months of a weekly series


def expand_recurring(events, max_occurrences=MAX_OCCURRENCES):
    """Expand a recurring series into one event per date.

    The product owner wants a recurring post to produce a separate entry per
    date, not one entry for the series. Expansion is done here rather than
    asking the model to enumerate dates, because date arithmetic is exactly the
    thing an LLM gets wrong (the existing corpus has a 3,319-row 01-01 sentinel
    cluster from bad date inference).

    Open-ended series are capped at max_occurrences so "every Thursday" cannot
    generate rows forever.
    """
    from datetime import datetime, timedelta

    from dateutil.relativedelta import relativedelta

    expanded = []
    for event in events:
        recurrence = (event.recurrence or '').lower()
        if recurrence not in RECURRENCE_STEPS or not event.start_date:
            expanded.append(event)
            continue
        try:
            start = datetime.strptime(event.start_date, '%m-%d-%Y')
        except ValueError:
            expanded.append(event)
            continue

        # A cross-midnight event carries a real end_date; each occurrence keeps
        # the same start->end span rather than discarding it.
        end_delta = None
        if event.end_date:
            try:
                end_delta = datetime.strptime(event.end_date, '%m-%d-%Y') - start
            except ValueError:
                end_delta = None

        until = None
        if event.recurrence_until:
            try:
                until = datetime.strptime(event.recurrence_until, '%m-%d-%Y')
            except ValueError:
                until = None

        # A bad recurrence_until (before start_date) must not silently delete
        # the event: every other failure branch above falls through to keeping
        # it, and this one used to break at n=0 having appended nothing.
        if until and until < start:
            expanded.append(event)
            continue

        for n in range(max_occurrences):
            if recurrence == 'monthly':
                # Calendar months, not 30-day hops: a Jan 31 series must not
                # drift to Mar 2 / Apr 1. relativedelta clamps to month end.
                occurrence = start + relativedelta(months=n)
            else:
                occurrence = start + timedelta(days=RECURRENCE_STEPS[recurrence] * n)
            if until and occurrence > until:
                break
            expanded.append(event.model_copy(update={
                'start_date': occurrence.strftime('%m-%d-%Y'),
                'end_date': ((occurrence + end_delta).strftime('%m-%d-%Y')
                             if end_delta is not None else None),
            }))
    return expanded


def _join(values):
    return ", ".join(v for v in values if v) if values else None


def _today_mmddyyyy():
    from datetime import date
    return date.today().strftime("%m-%d-%Y")


def to_api_payload(event: ExtractedEvent, *, shortcode, slide_index, ordinal,
                   post_link, image_url, for_location=None, poster=None):
    """Map one ExtractedEvent to the dict AdminEvent.post consumes.

    Replaces the ~60-line GPT->event mapping that was copy-pasted into four
    scraper functions and had already drifted apart.

    `poster` is the Instagram account username. It must be passed through:
    AdminEvent.post uses it to resolve the Account FK and to apply that
    account's AccountDetail enforce/fallback overrides — both of which are
    skipped entirely when poster is absent.
    """
    slide = slide_index if slide_index is not None else event.source_slide_index
    return {
        "name": event.event_name,
        "artist": _join(event.artists),
        "opener": _join(event.openers),
        "host": _join(event.hosts),
        "promoter": _join(event.promoters),
        "offering": _join(event.offerings),
        "genres": event.genres,
        "startDate": event.start_date,
        "endDate": event.end_date,
        "startTime": event.start_time,
        "endTime": event.end_time,
        # AdminEvent.get filters timestamp__gte, so a null timestamp makes the
        # event invisible in the admin dashboard. Fall back to today rather than
        # inventing a start_date — a missing event date stays honestly null.
        "timestamp": event.start_date or _today_mmddyyyy(),
        "venue": {
            "name": event.venue,
            "address": event.overall_address or event.address,
            "city": event.city,
            "state": event.state,
            "country": event.country,
        },
        "price": event.price,
        "ageBarrier": event.age_barrier,
        "ticket_link": event.ticket_link,
        "is_age_restricted": bool(event.age_barrier),
        "late": event.late,
        "linkInBio": event.link_in_bio,
        "rsvpRequired": event.rsvp_required,
        "isEvent": event.is_event,
        "numEvents": 1,
        # Must be an explicit False, not omitted: AdminEvent.post stores
        # event.get("is_duplicate") verbatim, and every read path filters
        # is_duplicate=False — which never matches NULL in SQL. Omitting it
        # would save the event but hide it from the entire site.
        "is_duplicate": False,
        "orig_link": post_link,
        "orig_thumb": image_url,
        "shortcode": shortcode,
        "sourceSlideIndex": slide,
        # Part of source_key. Assigned at build time (per slide, pre-filter) so
        # both ingestion paths derive identical keys for the same event.
        "sourceOrdinal": ordinal,
        "forLocation": for_location,
        "poster": poster,
    }
