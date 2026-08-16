from rest_framework.decorators import api_view
from rest_framework.views import APIView

from .models import Event, Venue, Execution, Feedback, FavoritesData, BlacklistedLink, EventMatch
from .serializers import EventSerializer, FeedbackSerializer
from .ingest import build_source_key, resolve_venue, upsert_event, coerce_int
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
                poster_name = event.get("poster")
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
                is_duplicate = event.get("is_duplicate")
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
        venues = Venue.objects.filter(Q(address__icontains=query) | Q(
            city__icontains=query) | Q(state__icontains=query) | Q(country__icontains=query)).all()

        try:
            # Get current date and time
            current_time = datetime.now()
            # Calculate the cutoff time for events older than 48 hours
            cutoff_time = current_time - EVENT_CUTOFF_TIME

            cutoff_date = cutoff_time.date()

            user_events = Event.objects.filter(
                ((Q(venue__in=venues) | Q(name__icontains=query)) | Q(artist__icontains=query) | Q(offering__icontains=query) 
                | Q(genres__icontains=query) | Q(opener__icontains=query) | Q(host__icontains=query))
                & Q(start_date__gte=cutoff_date) 
                & Q(is_duplicate=False)
            ).order_by('-timestamp').all()
        except:
            user_events = []

        events_serializer = EventSerializer(user_events, many=True)

        response_data = events_serializer.data
        return Success(response_data, status=True)
    except:
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

    POSSIBLE_FILTER_TYPES = ["date", "price", "artist", "location"]

    try:
        response_data = []

        # Get current date and time
        current_time = datetime.now()
        # Calculate the cutoff time for events older than 48 hours
        cutoff_time = current_time - EVENT_CUTOFF_TIME

        cutoff_date = cutoff_time.date()

        for filter in filters:
            _type = filter.get("type")
            condition = filter.get("condition")
            values = filter.get("values")

            logger.debug("Running for filter: "+str(_type)+"\n\n\n\n")

            if _type not in POSSIBLE_FILTER_TYPES:
                continue

            filtered_events = []

            if _type == "date":
                if condition == "between":
                    try:
                        intial_date = datetime.strptime(
                            values[0], '%m/%d/%Y').date()
                        final_date = datetime.strptime(
                            values[1], '%m/%d/%Y').date()
                    except:
                        return InvalidParameters()

                    filtered_events = Event.objects.filter(
                        start_date__range=[intial_date, final_date],
                        start_date__gte=cutoff_date,
                        is_duplicate=False
                    )

                if condition == "equal":
                    try:
                        date = datetime.strptime(values[0], '%m/%d/%Y').date()
                    except:
                        return InvalidParameters()
                    filtered_events = Event.objects.filter(
                        start_date__date=date,
                        start_date__gte=cutoff_date,
                        is_duplicate=False
                    ).all()

            if _type == "price":
                if condition == "between":
                    try:
                        initial_price = int(float(values[0]))
                        final_price = int(float(values[1]))
                    except:
                        return InvalidParameters()

                    #TODO: migrate price to be float instead of string
                    prices = []
                    current_price = initial_price
                    while current_price <= final_price:
                        prices.append(str(current_price))
                        
                        prices.append(str(current_price + 0.5))
                        
                        prices.append(str(current_price + 0.99))
                    
                        current_price += 1

                    filtered_events = Event.objects.filter(
                        price__in=prices,
                        start_date__gte=cutoff_date,
                        is_duplicate=False
                    )

                if condition == "equal":
                    try:
                        price = int(float(values[0]))
                    except:
                        return InvalidParameters()

                    filtered_events = Event.objects.filter(
                        price=str(price),
                        start_date__gte=cutoff_date,
                        is_duplicate=False
                    ).all()

            if _type == "artist":
                if condition == "equal":
                    try:
                        artist = str(values[0])
                    except:
                        return InvalidParameters()

                    logger.debug("Running for artist filter: "+str(artist)+"\n\n\n\n")

                    filtered_events = Event.objects.filter(
                        artist__startswith=artist,
                        start_date__gte=cutoff_date,
                        is_duplicate=False
                    ).all()

            if _type == "location":
                if condition == "equal":
                    try:
                        location = str(values[0])
                    except:
                        return InvalidParameters()

                    filtered_venues = Venue.objects.filter(address__startswith=location).all()

                    for venue in filtered_venues:
                        filtered_events += Event.objects.filter(
                            venue=venue,
                            start_date__gte=cutoff_date,
                            is_duplicate=False
                        ).all()

        events_serializer = EventSerializer(filtered_events, many=True)
        response_data = events_serializer.data

        return Success(response_data, status=True)
    except Exception as e:
        logger.debug("An error occurred during event filtering : "+str(e)+"\n\n\n\n")
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
            
        # Set duplicate status to False
        event.is_duplicate = False
        event.save()
        
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
    try:
        # Get current date and time
        current_time = datetime.now()
        # Calculate the cutoff time for events older than 24 hours
        cutoff_time = current_time - timedelta(hours=24)
        cutoff_date = cutoff_time.date()
        # Query events that are marked as duplicates and newer than the cutoff time
        duplicate_events = Event.objects.filter(
            is_duplicate=True,
            start_date__gte=cutoff_date
        ).order_by('-start_date')

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
