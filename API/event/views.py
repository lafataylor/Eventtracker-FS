from rest_framework.decorators import api_view
from rest_framework.views import APIView

from .models import Event, Venue, Execution, Feedback, FavoritesData, BlacklistedLink, EventMatch
from .serializers import EventSerializer, FeedbackSerializer
from .ingest import (build_source_key, coerce_int, normalize_poster_name,
                     resolve_venue, upsert_event)
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from c_admin.models import Account, AccountDetail

from event_tracker_api.validator import Validator
from c_auth.authentication import get_uid_from_token
from event_tracker_api.response import *

from dateutil.parser import parse
from datetime import datetime, timedelta

import json

validator = Validator()

import logging
logger = logging.getLogger('django')

EVENT_CUTOFF_TIME = timedelta(hours=25)

# Events with no extracted start_date are still real events (2,534 of them in
# production). They are included in search when recently scraped rather than
# excluded outright, which is what made them permanently unfindable.
UNDATED_EVENT_WINDOW_DAYS = 45

# Search returned every match unpaginated. Bound it so one broad query cannot
# serialize tens of thousands of rows.
SEARCH_RESULT_LIMIT = 500

# Price lives in a free-text CharField, so range filtering has to parse each
# value in Python. Cap how many rows that scan touches per request.
PRICE_SCAN_LIMIT = 5000

@api_view(["GET"])
def event(request):
    event_id = request.GET.get("id")

    if validator.is_missing([event_id]):
        return MissingInformation()
    if not validator.is_valid([[event_id, str]]):
        return InvalidParameters()

    try:
        _event = Event.objects.filter(id=event_id).first()

        if not _event:
            return EventNotFound()

        event_serializer = EventSerializer(_event)

        response_data = event_serializer.data
        return Success(response_data)
    except:
        return ServerProcessingError()

@api_view(["POST"])
def add_to_favorites(request):
    email = request.data.get("email")
    event_ids = request.data.get("event_ids")

    if validator.is_missing([email, event_ids]):
        return MissingInformation()
    if not validator.is_valid([[email, str], [event_ids, list]]):
        return InvalidParameters()

    # Get or create Favorites_Data for the user
    favorites_data, created = FavoritesData.objects.get_or_create(user_email=email)

    # Add the events to the favorites list
    try:
        events = Event.objects.filter(id__in=event_ids)
        favorites_data.events.add(*events)
        favorites_data.save()

        return Success({"status": "success", "message": "Events added to favorites."})
    except Exception as e:
        logger.error(f"Error adding to favorites: {e}")
        return ServerProcessingError(message="Error adding to favorites: "+str(e))

@api_view(["POST"])
def remove_from_favorites(request):
    email = request.data.get("email")
    event_ids = request.data.get("event_ids")

    if validator.is_missing([email, event_ids]):
        return MissingInformation()
    if not validator.is_valid([[email, str], [event_ids, list]]):
        return InvalidParameters()

    # Get Favorites_Data for the user
    try:
        favorites_data = FavoritesData.objects.filter(user_email=email).first()

        if not favorites_data:
            return Success({"status": "success", "message": "No favorites found for this user."})

        # Remove the events from the favorites list
        events = Event.objects.filter(id__in=event_ids)
        favorites_data.events.remove(*events)
        favorites_data.save()

        return Success({"status": "success", "message": "Events removed from favorites."})
    except Exception as e:
        logger.error(f"Error removing from favorites: {e}")
        return ServerProcessingError(message="Error removing from favorites: "+str(e))


@api_view(["GET"])
def get_favorites(request):
    email = request.GET.get("email")
    
    current_time = datetime.now()
    cutoff_time = current_time - EVENT_CUTOFF_TIME

    if validator.is_missing([email]):
        return MissingInformation()
    if not validator.is_valid([[email, str]]):
        return InvalidParameters()

    try:
        favorites_data = FavoritesData.objects.filter(user_email=email).first()

        if not favorites_data:
            return Success({"status": "success", "favorites": []})

        # Filter out events older than the cutoff time
        favorite_events = favorites_data.events.filter(timestamp__gte=cutoff_time)
        event_serializer = EventSerializer(favorite_events, many=True)

        response_data = event_serializer.data
        return Success({"status": "success", "favorites": response_data})
    except Exception as e:
        logger.error(f"Error retrieving favorites: {e}")
        return ServerProcessingError(message="Error retrieving favorites: "+str(e))


def _parse_price_bounds(condition, values):
    """(low, high) for a price filter, or None if the input is unusable."""
    try:
        if condition == "between" and len(values) >= 2:
            return float(values[0]), float(values[1])
        if condition == "equal" and values:
            exact = float(values[0])
            return exact, exact
    except (TypeError, ValueError):
        return None
    return None


def _price_within(price_text, low, high):
    """Is a free-text price inside [low, high]?

    Prices are strings the extractor produced: "$200", "MXN 150", "150 pesos",
    "Free", and tiered values like "$150, $200, $300". Matching only the FIRST
    number misses tiers (599 of 4,267 non-empty production prices contain more
    than one), so ANY number in range counts as a match.

    "Free"/"no cover" is treated as 0. A free-text price is inherently fuzzy;
    this errs toward including an event rather than hiding it, which is the
    behaviour the ticket asks for.
    """
    import re

    if price_text is None:
        return False
    text = str(price_text).strip()
    if not text:
        return False
    # Drop tokens that are numbers but not prices, so "Free before 11pm, $150
    # after" does not match on the "11" of "11pm" and "18+" is not read as $18:
    #   - clock times: 11pm, 10:30 PM
    #   - ages:        18+, 21 +
    cleaned = re.sub(r'\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b', ' ', text, flags=re.IGNORECASE)
    # \b anchors are required: without them "MXN 250 + service fee" matched the
    # "50 +" inside 250 and left "MXN 2", so a 250-peso event answered a $0-50
    # filter.
    cleaned = re.sub(r'\b\d{1,2}\s*\+', ' ', cleaned)
    # Check numeric tiers: a tiered price ("Free before 11pm, $150 after",
    # "$150, $200, $300") matches if ANY listed price is in range (599 of 4,267
    # production prices list more than one).
    for raw in re.findall(r'\d+(?:\.\d+)?', cleaned.replace(',', '')):
        try:
            if low <= float(raw) <= high:
                return True
        except ValueError:
            continue
    # No price number matched: a free/no-cover event is a 0-price match.
    if re.search(r'\b(free|gratis|no cover|sin costo|entrada libre)\b',
                 text, re.IGNORECASE):
        return low <= 0 <= high
    return False


def convert_date_format(date_str):
    if date_str is None:
        return None
    
    try:
        original_date = datetime.strptime(date_str, "%m-%d-%Y")
        
        #TODO: Remove this after 2025 begins
        if original_date.year == 2024 and original_date.month == 1 and original_date.day == 1:
            converted_date_str = "2025-01-01"
        else:
            converted_date_str = original_date.strftime("%Y-%m-%d")
        
        return converted_date_str
    except Exception as e:
        return None


class AdminEvent(APIView):

    def get(self, request, format=None):
        token = request.headers.get("Authorization")
        uid = get_uid_from_token(token=token)

        try:
            """user_accounts = Account.objects.filter(
                created_by=uid,
            ).exclude(id=uid).all()

            _events = Event.objects.filter(
                poster__in=user_accounts).order_by('-timestamp').all()"""


            # Get current date and time
            current_time = datetime.now() - timedelta(hours=24)
            # Calculate the cutoff time for events older than 48 hours
            cutoff_time = current_time - EVENT_CUTOFF_TIME

            # Make all posts shared for now, but only grab ones before the cutoff time
            _events = Event.objects.filter(timestamp__gte=cutoff_time).order_by('-timestamp').all()

            event_serializer = EventSerializer(_events, many=True)

            response_data = event_serializer.data
            return Success(response_data, status=True)
        except:
            return ServerProcessingError()

    def post(self, request, format=None):
        events = request.data.get("events")
        # token = request.headers.get("Authorization")
        # uid = get_uid_from_token(token=token)

        logger.debug("Event creation launch\n\n\n")

        try:
            saved_events = []
            # Per-batch ordinal counter, keyed by (shortcode, slide). Two events
            # extracted from the same carousel slide get distinct positional keys
            # so neither can overwrite the other — critical because 72% of events
            # have no name to distinguish them by.
            slide_ordinals = {}
            for event in events:
                exec_id = event.get("exec_id")
                if exec_id:
                    exec_id = Execution.objects.get(pk=exec_id)

                # Poster account — initialised to None so a poster-less event does
                # not NameError, and so later events don't silently inherit the
                # previous event's account (both were live bugs).
                poster = None
                # Reject serialized-Account blobs: creating an Account named
                # after one is what produced 37 rows whose username is a nested
                # dict, each run wrapping the previous one.
                poster_name = normalize_poster_name(event.get("poster"))
                if poster_name:
                    try:
                        poster = Account.objects.filter(user=poster_name).first() or \
                            Account.objects.create(
                                user=poster_name, is_personal=True, created_by="Admin")
                    except Exception as e:
                        logger.debug("Error while creating poster: " + str(e) + "\n\n\n")

                # Resolve account detail overrides (enforce / fallback) — non-fatal.
                venue_overrides = {}
                event_overrides = {}
                try:
                    if poster and hasattr(poster, 'pk'):
                        raw_venue = event.get('venue') or {}
                        for detail in AccountDetail.objects.filter(account=poster):
                            fn, val, mode = detail.field_name, detail.value, detail.mode
                            if fn.startswith('venue_'):
                                vkey = fn[6:]  # name/city/state/country/address
                                current = raw_venue.get(vkey) if isinstance(raw_venue, dict) else None
                                if mode == 'enforce' or (mode == 'fallback' and not current):
                                    venue_overrides[vkey] = val
                            else:
                                # AccountDetail field_names are snake_case but a
                                # few event JSON keys are camelCase; without this
                                # alias, fallback never sees the real value and so
                                # always overrides (behaving like enforce).
                                json_key = {'age_barrier': 'ageBarrier'}.get(fn, fn)
                                current = event.get(json_key)
                                if mode == 'enforce' or (mode == 'fallback' and not current):
                                    event_overrides[fn] = val
                except Exception as _detail_exc:
                    logger.warning(f"AccountDetail override skipped (non-fatal): {_detail_exc}")
                    venue_overrides, event_overrides = {}, {}

                # Fold venue overrides into the lookup values BEFORE resolving, so
                # an identical venue is reused only when it matches the final
                # values. Never mutate/save a shared venue row — doing so would
                # rewrite the venue for every other event that reuses it.
                venue_data = dict(event.get("venue") or {})
                venue_data.update(venue_overrides)
                venue = resolve_venue(Venue, venue_data)

                def _ev(key, raw_key=None):
                    """Return event_overrides value if present, else fall back to event dict."""
                    return event_overrides.get(key, event.get(raw_key or key))

                name = _ev("name")
                artist = _ev("artist")
                opener = event.get("opener")
                host = event.get("host")
                timestamp = convert_date_format(event.get("timestamp"))
                start_date = convert_date_format(event.get("startDate"))
                start_time = event.get("startTime")
                end_date = convert_date_format(event.get("endDate"))
                end_time = event.get("endTime")
                promoter = event.get("promoter")
                offering = event.get("offering")
                price = _ev("price")
                ticket_link = _ev("ticket_link")
                is_age_restricted = event.get("is_age_restricted")
                orig_link = event.get("orig_link")
                orig_thumb = event.get("orig_thumb")
                is_event = event.get("isEvent")
                age_barrier = _ev("age_barrier", "ageBarrier")
                late = event.get("late")
                link_in_bio = event.get("linkInBio")
                rsvp_required = event.get("rsvpRequired")
                num_events = event.get("numEvents")
                genres = _ev("genres")
                # Coerce at the source: is_duplicate is null=True, and every
                # read path filters is_duplicate=False, which never matches NULL
                # in SQL. Any caller that omits the key would otherwise save an
                # event that is invisible site-wide. Default to visible.
                is_duplicate = bool(event.get("is_duplicate") or False)
                forLocation = _ev("forLocation")


                # Post identity for idempotent ingestion (Tickets 1 & 2).
                # Positional key {shortcode}__{slide}__{ordinal}: collision-free
                # even when the name is null, so distinct events never overwrite
                # each other. Callers with no shortcode fall back to a plain
                # create (previous behaviour), so nothing regresses until the
                # extractor starts supplying post identity.
                shortcode = event.get("shortcode")
                slide_index = event.get("sourceSlideIndex")
                source_key = event.get("source_key")
                if not source_key and shortcode:
                    # Key the counter on the SAME coerced slide value the key
                    # builder uses, so a None-slide and a 0-slide event of one
                    # post don't each start at ordinal 0 and collide on
                    # "{shortcode}__0__0".
                    okey = (shortcode, coerce_int(slide_index))
                    ordinal = slide_ordinals.get(okey, 0)
                    slide_ordinals[okey] = ordinal + 1
                    source_key = build_source_key(shortcode, slide_index, ordinal)

                event_defaults = dict(
                    exec=exec_id,
                    venue=venue,
                    poster=poster,
                    name=name,
                    artist=artist,
                    host=host,
                    promoter=promoter,
                    opener=opener,
                    offering=offering,
                    timestamp=timestamp,
                    start_date=start_date,
                    start_time=start_time,
                    end_date=end_date,
                    end_time=end_time,
                    price=price,
                    ticket_link=ticket_link,
                    is_age_restricted=is_age_restricted,
                    orig_link=orig_link,
                    orig_thumb=orig_thumb,
                    is_event=is_event,
                    age_barrier=age_barrier,
                    late=late,
                    link_in_bio=link_in_bio,
                    rsvp_required=rsvp_required,
                    num_events=num_events,
                    genres=genres,
                    is_duplicate=is_duplicate,
                    forLocation=forLocation,
                )

                # Upsert instead of the previous blind create(), which let every
                # re-scrape insert another row (23,355 surplus rows in prod).
                event_obj, _action = upsert_event(
                    Event, source_key, shortcode, slide_index, event_defaults)
                saved_events.append(event_obj.id)

            logger.debug("Event created successfully.\n\n\n")

            return Success(data=saved_events, status=True)
        except Exception as e:
            logger.debug("Error creating event: "+str(e)+"\n\n\n\n")
            print("Error creating event: ",str(e))
            return ServerProcessingError()

    def put(self, request, format=None):
        event_id = request.data.get("id")
        event = request.data.get("event")

        if validator.is_missing([event_id, event]):
            logger.debug("Error updating event: missing info \n\n\n\n")
            return MissingInformation()
        if not validator.is_valid([[event, dict]]):
            logger.debug("Error updating event: invalid format \n\n\n\n")
            return InvalidParameters()

        try:
            updated_event = Event.objects.filter(id=event_id).first()
            if not updated_event:
                return EventNotFound()

            if "name" in event:
                updated_event.name = event.get("name")
            if "venue" in event:
                event_venue = event['venue']
                current_venue = Venue.objects.get(id=event_venue['id'])

                # Venues are now shared between events (resolve_venue reuses an
                # identical row instead of creating one per event), so editing
                # in place would silently rewrite the venue for every other
                # event pointing at it. Build the new values, then reuse or
                # create a matching row and repoint only THIS event at it.
                values = {
                    field: event_venue.get(field, getattr(current_venue, field))
                    for field in ('name', 'address', 'city', 'state', 'country')
                }
                shared = Event.objects.filter(venue=current_venue).exclude(
                    id=updated_event.id).exists()
                if shared:
                    updated_event.venue = resolve_venue(Venue, values)
                else:
                    for field, value in values.items():
                        setattr(current_venue, field, value)
                    current_venue.save()

            if "artist" in event:
                updated_event.artist = event.get("artist")
            if "opener" in event:
                updated_event.opener = event.get("opener")
            if "host" in event:
                updated_event.host = event.get("host")
            if "promoter" in event:
                updated_event.promoter = event.get("promoter")
            if "offering" in event:
                updated_event.offering = event.get("offering")
            # if "timestamp" in event:
            #     updated_event.timestamp = event.get("timestamp")
            if "price" in event:
                updated_event.price = event.get("price")
            if "ticket_link" in event:
                updated_event.ticket_link = event.get("ticket_link")
            if "is_age_restricted" in event:
                updated_event.is_age_restricted = event.get(
                    "is_age_restricted")
            if "age_barrier" in event:
                updated_event.age_barrier = event.get("age_barrier")
            if "start_date" in event:
                updated_event.start_date = event.get("start_date")
            if "start_time" in event:
                updated_event.start_time = event.get("start_time")
            if "end_date" in event:
                updated_event.end_date = event.get("end_date")
            if "end_time" in event:
                updated_event.end_time = event.get("end_time")
            if "orig_link" in event:
                updated_event.orig_link = event.get("orig_link")
            if "orig_thumb" in event:
                updated_event.orig_thumb = event.get("orig_thumb")
            if "genres" in event:
                updated_event.genres = event.get("genres")
            if "account" in event:
                account_value = event.get("account")
                if account_value:
                    account_obj = Account.objects.filter(user=account_value).first()
                    if not account_obj:
                        account_obj = Account.objects.create(
                            user=account_value,
                            is_personal=True,
                            created_by="Admin"
                        )
                        account_obj.save()
                    updated_event.poster = account_obj
                else:
                    updated_event.poster.user = "unknown"

            updated_event.save()

            return Success()
        except:
            return ServerProcessingError()

    def delete(self, request, format=None):
        event_ids = request.data.get("events")

        if validator.is_missing([event_ids]):
            return MissingInformation()
        if not validator.is_valid([[event_ids, list]]):
            logger.debug("Error deleting events: invalid ids")
            return InvalidParameters()

        try:
            for event_id in event_ids:
                event = Event.objects.filter(id=event_id).first()

                if not event:
                    continue
                
                # Blacklist the original link before deleting
                if event.orig_link:
                    # Check if already blacklisted to avoid duplicates
                    if not BlacklistedLink.objects.filter(url=event.orig_link).exists():
                        # Create blacklist entry
                        try:
                            admin = None
                            BlacklistedLink.objects.create(
                                url=event.orig_link,
                                reason="Manually deleted by admin",
                                created_by=admin
                            )
                            logger.debug(f"Blacklisted link: {event.orig_link}")
                        except Exception as bl_error:
                            logger.error(f"Error blacklisting link: {str(bl_error)}")
                
                # Now delete the event
                event.delete()

            return Success()
        except Exception as e:
            logger.debug("Error deleting events: "+str(e)+"\n\n\n\n")
            print("Error deleting events: ",str(e))
            return ServerProcessingError()

@api_view(["GET"])
def user_events(request):
    user = request.GET.get("user")

    if validator.is_missing([user]):
        return MissingInformation()
    if not validator.is_valid([[user, str]]):
        return InvalidParameters()

    try:
        user_account = Account.objects.filter(user=user).first()
        if not user_account:
            return UserNotFound()

        user_events = Event.objects.filter(poster=user_account, is_duplicate=False).all()

        events_serializer = EventSerializer(user_events, many=True)

        response_data = events_serializer.data
        return Success(response_data, status=True)

    except:
        return ServerProcessingError()


@api_view(["GET"])
def search_events(request):
    query = request.GET.get("query")

    if validator.is_missing([query]):
        return MissingInformation()

    try:
        # venue NAME was previously not searched, only address/city/state/country.
        # 6,738 venues have a name that does not appear in their address, so
        # searching for those venues by name returned nothing.
        venues = Venue.objects.filter(
            Q(name__icontains=query) | Q(address__icontains=query)
            | Q(city__icontains=query) | Q(state__icontains=query)
            | Q(country__icontains=query))

        current_time = datetime.now()
        cutoff_date = (current_time - EVENT_CUTOFF_TIME).date()
        # Undated events are kept only if they were scraped recently, so the
        # backlog of old undated rows does not flood results.
        undated_cutoff = current_time - timedelta(days=UNDATED_EVENT_WINDOW_DAYS)

        matches_text = (
            Q(venue__in=venues) | Q(name__icontains=query)
            | Q(artist__icontains=query) | Q(offering__icontains=query)
            | Q(genres__icontains=query) | Q(opener__icontains=query)
            | Q(host__icontains=query) | Q(promoter__icontains=query)
            | Q(forLocation__icontains=query))

        # start_date IS NULL previously excluded the event outright, hiding
        # 2,534 real events from search permanently. Include them when recent.
        in_window = (Q(start_date__gte=cutoff_date)
                     | (Q(start_date__isnull=True)
                        & Q(created_at__gte=undated_cutoff)))

        # Exclude only KNOWN non-events. is_event is null=True; filtering
        # is_event=True would also drop NULL rows (unknown classification),
        # which were previously searchable and have no admin control to flip.
        user_events = (Event.objects
                       .filter(matches_text & in_window
                               & Q(is_duplicate=False) & Q(suppressed=False)
                               & ~Q(is_event=False))
                       .select_related('venue', 'poster')
                       .order_by('-timestamp')
                       .distinct()[:SEARCH_RESULT_LIMIT])

        events_serializer = EventSerializer(user_events, many=True)
        return Success(events_serializer.data, status=True)
    except Exception as e:
        # Was a bare `except: user_events = []`, which turned any query error
        # into a silent "no results" and made real failures undiagnosable.
        logger.error(f"Error searching events for {query!r}: {e}")
        return ServerProcessingError()


@api_view(["GET"])
def date_events(request):
    date = request.GET.get("date")

    if validator.is_missing([date]):
        return MissingInformation()
    try:
        if not validator.is_valid([[date, str]]):
            raise ValueError()
        date = parse(date).date()
    except ValueError:
        return InvalidParameters()

    try:
        # Get current date and time
        current_time = datetime.now()
        # Calculate the cutoff time for events older than 48 hours
        cutoff_time = current_time - EVENT_CUTOFF_TIME

        cutoff_date = cutoff_time.date()

        date_events = Event.objects.filter(
            start_date__date=date, 
            start_date__gte=cutoff_date,
            is_duplicate=False
        ).all()

        events_serializer = EventSerializer(date_events, many=True)

        response_data = events_serializer.data
        return Success(response_data, status=True)

    except Exception as e:
        logger.debug("Error getting events (simple): "+str(e)+"\n\n\n\n")
        print("Error getting events (simple): ",str(e))
        return ServerProcessingError()


@api_view(["GET"])
def date_range_events(request):
    start_date = request.GET.get("start")
    end_date = request.GET.get("end")

    if validator.is_missing([start_date, end_date]):
        return MissingInformation()
    try:
        if not validator.is_valid([[start_date, str], [end_date, str]]):
            raise ValueError()
        start_date = parse(start_date).date()
        end_date = parse(end_date).date()
    except ValueError:
        return InvalidParameters()

    try:
        # Get current date and time
        current_time = datetime.now()
        # Calculate the cutoff time for events older than 48 hours
        cutoff_time = current_time - EVENT_CUTOFF_TIME

        cutoff_date = cutoff_time.date()

        date_events = Event.objects.filter(
            Q(start_date__range=(start_date, end_date)) | Q(end_date__range=(start_date, end_date)),
            start_date__gte=cutoff_date,
            is_duplicate=False
        ).all()

        events_serializer = EventSerializer(date_events, many=True)

        response_data = events_serializer.data
        return Success(response_data, status=True)

    except Exception as e:
        logger.debug("Error getting events (range): "+str(e)+"\n\n\n\n")
        print("Error getting events (range): ",str(e))
        return ServerProcessingError()


@api_view(["POST"])
def filter_events(request):
    filters = request.data.get("filters")

    if validator.is_missing([filters]):
        return MissingInformation()
    try:
        if not validator.is_valid([[filters, list]]):
            raise Exception()
        for _object in filters:
            if type(_object) != dict:
                raise Exception()
    except:
        return InvalidParameters()

    POSSIBLE_FILTER_TYPES = ["date", "price", "artist", "location", "account"]

    try:
        current_time = datetime.now()
        cutoff_date = (current_time - EVENT_CUTOFF_TIME).date()

        # Base scope: upcoming, visible events. The date cutoff belongs here,
        # not inside the date branch — otherwise a price/artist/location filter
        # searches the whole 53k-row history instead of upcoming events.
        queryset = (Event.objects
                    .filter(is_duplicate=False, suppressed=False)
                    .filter(start_date__gte=cutoff_date))

        # The UI attaches a conjugation ("and"/"or") to each filter. It was
        # ignored, so an "Or" combination silently returned the intersection.
        # AND-filters narrow the queryset; OR-filters accumulate into one Q.
        or_q = Q()
        and_clauses = []
        has_or = False
        price_bounds = []          # evaluated last; needs Python-side parsing
        applied = 0

        for _filter in filters:
            _type = _filter.get("type")
            condition = _filter.get("condition")
            values = _filter.get("values") or []
            use_or = str(_filter.get("conjugation") or "and").lower() == "or"

            # An unrecognised type (the admin UI also offers "run") must not
            # silently pass through, or the response would be an unfiltered
            # page of events reported as success.
            if _type not in POSSIBLE_FILTER_TYPES:
                continue

            clause = None
            if _type == "date":
                if condition == "between" and len(values) >= 2:
                    try:
                        start = datetime.strptime(values[0], '%m/%d/%Y').date()
                        end = datetime.strptime(values[1], '%m/%d/%Y').date()
                    except (ValueError, TypeError):
                        return InvalidParameters()
                    clause = Q(start_date__range=[start, end])
                elif condition == "equal" and values:
                    try:
                        day = datetime.strptime(values[0], '%m/%d/%Y').date()
                    except (ValueError, TypeError):
                        return InvalidParameters()
                    clause = Q(start_date__date=day)
                else:
                    # Malformed date filter: reject rather than quietly
                    # returning everything.
                    return InvalidParameters()

            elif _type == "price":
                bounds = _parse_price_bounds(condition, values)
                if bounds is None:
                    return InvalidParameters()
                # Price needs Python-side parsing of a free-text field, so it is
                # always ANDed (its conjugation is not honoured — noted here so a
                # reader does not assume OR-price works).
                price_bounds.append(bounds)
                applied += 1
                continue

            elif _type == "artist":
                if condition != "equal" or not values:
                    return InvalidParameters()
                clause = Q(artist__icontains=str(values[0]))

            elif _type == "location":
                if condition != "equal" or not values:
                    return InvalidParameters()
                location = str(values[0])
                clause = (Q(venue__address__icontains=location)
                          | Q(venue__name__icontains=location)
                          | Q(venue__city__icontains=location)
                          | Q(forLocation__icontains=location))

            elif _type == "account":
                if condition != "equal" or not values:
                    return InvalidParameters()
                clause = Q(poster__user__in=[str(v) for v in values])

            if clause is None:
                continue
            applied += 1
            and_clauses.append(clause)
            if use_or:
                has_or = True

        if not applied:
            # Nothing recognised: return no results rather than a page of
            # arbitrary events labelled "success".
            return Success([], status=True)

        # The UI only renders the conjugation dropdown from the SECOND filter
        # onward, so filter 0 is always sent as "and". ANDing it before applying
        # or_q made "Artist is A Or B" return the intersection (i.e. nothing).
        # When any filter says OR, the whole set is unioned; otherwise ANDed.
        if has_or:
            # Any "Or" makes the whole selection a union. The UI attaches the
            # conjugation to filter N to join it to the ones before, and never
            # offers the dropdown on filter 0 — so unioning only the OR-marked
            # clauses dropped filter 0 entirely and "DJ One Or DJ Two" returned
            # just DJ Two.
            for clause in and_clauses:
                or_q |= clause
            queryset = queryset.filter(or_q)
        else:
            for clause in and_clauses:
                queryset = queryset.filter(clause)

        # Price is applied last and only to the already-narrowed set, because it
        # needs Python-side parsing of a free-text field. Cap the id list to the
        # result limit so the final IN clause stays small.
        for low, high in price_bounds:
            ids = [e.id for e in queryset.only('id', 'price')[:PRICE_SCAN_LIMIT]
                   if _price_within(e.price, low, high)][:SEARCH_RESULT_LIMIT]
            queryset = queryset.filter(id__in=ids)

        events = (queryset.select_related('venue', 'poster')
                  .order_by('-timestamp').distinct()[:SEARCH_RESULT_LIMIT])
        return Success(EventSerializer(events, many=True).data, status=True)
    except Exception as e:
        logger.error(f"An error occurred during event filtering: {e}")
        return ServerProcessingError()


@api_view(["POST"])
def add_event_feedback(request):
    event_id = request.data.get("event_id")
    changes = request.data.get("changes")

    event = Event.objects.filter(id=event_id).first()

    try:
        changes_list = json.loads(changes)

        feedbacks = []
        for change in changes_list:
            feedback = Feedback.objects.create(
                event=event,
                changes=json.dumps(change)
            )

            feedback.save()

            response_data = FeedbackSerializer(feedback).data

            feedbacks.append(response_data)

        return Success(data=feedbacks, status=True)
    except:
        return ServerProcessingError()

@api_view(["POST"])
def remove_duplicate_label(request):
    event_id = request.data.get("event_id")

    if validator.is_missing([event_id]):
        return MissingInformation()
    if not validator.is_valid([[event_id, str]]):
        return InvalidParameters()

    try:
        event = Event.objects.filter(id=event_id).first()
        if not event:
            return EventNotFound()
            
        # Clear BOTH hiding mechanisms. The review flow sets suppressed +
        # canonical alongside is_duplicate, so clearing is_duplicate alone left
        # the event hidden from search/filter and made the UI's "you can
        # restore it later" untrue.
        event.is_duplicate = False
        event.duplicate_link = None
        event.suppressed = False
        event.canonical = None
        event.save(update_fields=['is_duplicate', 'duplicate_link',
                                  'suppressed', 'canonical'])

        return Success({"status": "success", "message": "Duplicate label removed from event."})
    except Exception as e:
        logger.error(f"Error removing duplicate label: {e}")
        return ServerProcessingError(message="Error removing duplicate label: "+str(e))

@api_view(["POST"])
def add_duplicate_label(request):
    event_id = request.data.get("event_id")

    if validator.is_missing([event_id]):
        return MissingInformation()
    if not validator.is_valid([[event_id, str]]):
        return InvalidParameters()

    try:
        event = Event.objects.filter(id=event_id).first()
        if not event:
            return EventNotFound()
            
        # Set duplicate status to True
        event.is_duplicate = True
        event.save()
        
        return Success({"status": "success", "message": "Duplicate label added to event."})
    except Exception as e:
        logger.error(f"Error adding duplicate label: {e}")
        return ServerProcessingError(message="Error adding duplicate label: "+str(e))


@api_view(["GET"])
def get_duplicate_events(request):
    """Every event currently hidden as a duplicate, for the recovery view.

    Includes rows hidden by automated flagging AND by a confirmed pair review,
    because the UI promises "you can restore it later" for both — excluding
    suppressed rows left them with no way back. remove_duplicate_label clears
    both flags, so anything listed here really is restorable.

    No start_date floor: a wrongly-hidden event is usually past-dated, and a
    24h window made most of them unreachable. Newest-flagged first, bounded.
    """
    try:
        limit = min(int(request.GET.get("limit", 200)), 500)
    except (TypeError, ValueError):
        limit = 200
    try:
        duplicate_events = (Event.objects
                            .filter(Q(is_duplicate=True) | Q(suppressed=True))
                            .select_related('venue', 'poster')
                            .order_by('-created_at')[:limit])
        event_serializer = EventSerializer(duplicate_events, many=True)
        return Success({"status": "success", "duplicate_events": event_serializer.data})
    except Exception as e:
        logger.error(f"Error retrieving duplicate events: {e}")
        return ServerProcessingError(message="Error retrieving duplicate events: "+str(e))


@api_view(["GET"])
def get_event_matches(request):
    """Ticket 1: candidate duplicate PAIRS for side-by-side review.

    Unlike get_duplicate_events (which returns a flat list of flagged events and
    a bare duplicate_link string), this returns both full events of each pair so
    the owner can actually compare them. Ordered most-confident first.
    """
    status = request.GET.get("status", "pending")
    try:
        limit = max(1, min(int(request.GET.get("limit", 50)), 200))
    except (TypeError, ValueError):
        limit = 50

    try:
        # Exclude pairs whose events are already suppressed. With chained pairs
        # (A,B) then (B,C), keeping B in the second pair would clear its
        # suppression and resurrect a duplicate the owner had already hidden.
        matches = (EventMatch.objects.filter(status=status)
                   .exclude(event_a__suppressed=True)
                   .exclude(event_b__suppressed=True)
                   .select_related('event_a', 'event_a__venue', 'event_a__poster',
                                   'event_b', 'event_b__venue', 'event_b__poster')
                   .order_by('-score', '-id')[:limit])
        data = [{
            "match_id": m.id,
            "score": m.score,
            "match_type": m.match_type,
            "event_a": EventSerializer(m.event_a).data,
            "event_b": EventSerializer(m.event_b).data,
        } for m in matches]
        pending_total = (EventMatch.objects.filter(status='pending')
                         .exclude(event_a__suppressed=True)
                         .exclude(event_b__suppressed=True).count())
        return Success({"matches": data, "pending_total": pending_total})
    except Exception as e:
        logger.error(f"Error retrieving event matches: {e}")
        return ServerProcessingError(message="Error retrieving event matches: " + str(e))


@api_view(["POST"])
def resolve_event_match(request):
    """Ticket 1: the owner's verdict on a candidate pair.

    action:
      keep_a / keep_b  -> suppress the other event (recoverable: suppressed=True
                          + canonical set, never deleted) and confirm the match
      not_duplicate    -> reject the match, touch neither event
    """
    match_id = request.data.get("match_id")
    action = request.data.get("action")

    if validator.is_missing([match_id, action]):
        return MissingInformation()
    if action not in ("keep_a", "keep_b", "not_duplicate"):
        return InvalidParameters()
    try:
        match_id = int(match_id)
    except (TypeError, ValueError):
        return InvalidParameters()

    try:
        match = EventMatch.objects.select_related('event_a', 'event_b').filter(id=match_id).first()
        if not match:
            return EventNotFound()

        # All-or-nothing: keep/drop/match mutations must commit together, or a
        # mid-way failure would leave one event mutated and the pair still
        # pending. Re-resolving a pair is allowed (the owner may change their
        # mind) and is idempotent.
        with transaction.atomic():
            if action == "not_duplicate":
                match.status = "rejected"
            else:
                keep = match.event_a if action == "keep_a" else match.event_b
                drop = match.event_b if action == "keep_a" else match.event_a
                # The owner chose to keep this event, so it must be visible —
                # clear any suppression AND any stale is_duplicate flag left by
                # the old (broken) dedup, which over-flagged real events.
                keep.suppressed = False
                keep.canonical = None
                keep.is_duplicate = False
                keep.duplicate_link = None
                keep.save(update_fields=['suppressed', 'canonical', 'is_duplicate', 'duplicate_link'])
                # Set is_duplicate on the dropped event so the existing read
                # paths (which filter is_duplicate=False) hide it immediately;
                # suppressed carries the canonical link. (A later cleanup can
                # migrate reads to `suppressed` and retire is_duplicate.)
                drop.suppressed = True
                drop.canonical = keep
                drop.is_duplicate = True
                drop.duplicate_link = keep.orig_link or f"event_{keep.id}"
                drop.save(update_fields=['suppressed', 'canonical', 'is_duplicate', 'duplicate_link'])
                match.status = "confirmed"

            match.reviewed_at = timezone.now()
            match.save(update_fields=['status', 'reviewed_at'])
        return Success({"status": "success", "resolved": action})
    except Exception as e:
        logger.error(f"Error resolving event match: {e}")
        return ServerProcessingError(message="Error resolving event match: " + str(e))


@api_view(["GET"])
def list_locations(request):
    try:
        locations = set()
        has_general = False

        for account in Account.objects.all():
            if account.forLocation:
                locations.add(account.forLocation)
            else:
                has_general = True

        result = []
        if has_general:
            result.append("general")
        result.extend(sorted(locations))

        return Success(result)
    except Exception as e:
        logger.error(f"Error listing locations: {e}")
        return ServerProcessingError()
