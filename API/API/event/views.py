from rest_framework.decorators import api_view
from rest_framework.views import APIView

from .models import Event, Venue, Execution, Feedback, FavoritesData, BlacklistedLink
from .serializers import EventSerializer, FeedbackSerializer
from django.db.models import Q

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
            for event in events:
                venue = event.get("venue")
                if venue:
                    venue_obj = Venue.objects.create(
                        name=venue.get("name"),
                        city=venue.get("city"),
                        state=venue.get("state"),
                        country=venue.get("country"),
                        address=venue.get("address"),
                    )
                    venue_obj.save()
                    venue = venue_obj

                exec_id = event.get("exec_id")
                if exec_id:
                    exec_id = Execution.objects.get(pk=exec_id)

                poster_name = event.get("poster")
                if poster_name:
                    try:
                        poster = Account.objects.filter(user=poster_name)
                        if poster.exists():
                            poster = poster[0]
                        else:
                            poster_obj = Account.objects.create(
                                user=poster_name,
                                is_personal=True,
                                created_by = "Admin"
                            )
                            poster_obj.save()
                            poster = poster_obj
                            #return ServerProcessingError()
                    except Exception as e:
                        logger.debug("Error while creating poster: "+str(e)+"\n\n\n")
                        
                        #return ServerProcessingError()

                # Resolve account detail overrides (enforce / fallback) — non-fatal
                venue_overrides = {}
                event_overrides = {}
                try:
                    if poster and hasattr(poster, 'pk'):
                        account_details = AccountDetail.objects.filter(account=poster)
                        raw_venue = event.get('venue') or {}
                        for detail in account_details:
                            fn = detail.field_name
                            val = detail.value
                            mode = detail.mode
                            if fn.startswith('venue_'):
                                vkey = fn[6:]  # strip 'venue_' prefix → name/city/state/country/address
                                current_venue_val = raw_venue.get(vkey) if isinstance(raw_venue, dict) else None
                                if mode == 'enforce' or (mode == 'fallback' and not current_venue_val):
                                    venue_overrides[vkey] = val
                            else:
                                current_event_val = event.get(fn)
                                if mode == 'enforce' or (mode == 'fallback' and not current_event_val):
                                    event_overrides[fn] = val
                except Exception as _detail_exc:
                    logger.warning(f"AccountDetail override skipped (non-fatal): {_detail_exc}")
                    venue_overrides = {}
                    event_overrides = {}

                # Apply venue overrides
                if venue_overrides and isinstance(venue, Venue):
                    try:
                        for _vk, _vv in venue_overrides.items():
                            if hasattr(venue, _vk):
                                setattr(venue, _vk, _vv)
                        venue.save()
                    except Exception as _ve:
                        logger.warning(f"Venue override save failed (non-fatal): {_ve}")

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


                event_obj = Event.objects.create(
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
                    forLocation=forLocation
                )
                event_obj.save()
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

                updated_event_venue = Venue.objects.get(id=event_venue['id'])

                if "name" in event_venue:
                    updated_event_venue.name = event_venue['name']
                if "address" in event_venue:
                    updated_event_venue.address = event_venue['address']
                if "city" in event_venue:
                    updated_event_venue.city = event_venue['city']
                if "state" in event_venue:
                    updated_event_venue.state = event_venue['state']
                if "country" in event_venue:
                    updated_event_venue.country = event_venue['country']

                updated_event_venue.save()

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
