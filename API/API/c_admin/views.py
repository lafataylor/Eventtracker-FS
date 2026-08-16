import pyrebase
from rest_framework.decorators import api_view
from rest_framework.views import APIView

from .models import Account, Logs, Keywords, UserFeedback, GeocodingCache, AccountDetail, DETAIL_FIELD_CHOICES
from event.models import Execution, Feedback
from .serializers import AccountSerializer, LogsSerializer, KeywordsSerializer, UserFeedbackSerializer, GeocodingCacheSerializer, AccountDetailSerializer
from event.serializers import EventSerializer, ExecutionSerializer, FeedbackSerializer

from event_tracker_api.response import *
from event_tracker_api.modules import update_data_persistence_value, get_data_persistence_value
from event_tracker_api.validator import Validator

from c_auth.authentication import get_uid_from_token

from .scraper import *
from .session import *
from .constants import *

# Ticket 2 — post-level carousel extraction.
# `client` from scraper is the OpenAI client, but create_event_from_instagram_link
# rebinds `client` to an ApifyClient locally, so alias it to stay reachable.
from .scraper import client as openai_client
from .extraction import extract_events
from .post_ingest import (build_payloads, mirror_slides, post_shortcode,
                          shortcode_from_url, slide_image_urls)

import base64
import os
import requests

from datetime import datetime
import json

import subprocess

from threading import Thread

from django.conf import settings

import logging
logger = logging.getLogger('django')

from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(dotenv_path=os.path.join(settings.BASE_DIR, '.env.local'))

validator = Validator()

# Google Maps API configuration
GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY')


def _load_firebase_service_account():
    service_account_path = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_PATH",
        "firebase-service-account.json",
    )
    if not os.path.isabs(service_account_path):
        service_account_path = os.path.join(settings.BASE_DIR, service_account_path)
    if not os.path.exists(service_account_path):
        raise FileNotFoundError(
            f"Firebase service account file not found at {service_account_path}. "
            "Copy firebase-service-account.example.json and set FIREBASE_SERVICE_ACCOUNT_PATH."
        )
    with open(service_account_path, "r") as service_account_file:
        return json.load(service_account_file)


config = {
    "apiKey": os.getenv("FIREBASE_API_KEY"),
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
    "databaseURL": os.getenv("FIREBASE_DATABASE_URL"),
    "projectId": os.getenv("FIREBASE_PROJECT_ID"),
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
    "serviceAccount": _load_firebase_service_account(),
}

firebase = pyrebase.initialize_app(config)

db = firebase.database()


@api_view(["POST"])
def add_user(request):
    users = request.data.get("users")
    token = request.headers.get("Authorization")
    uid = get_uid_from_token(token=token)

    if validator.is_missing([users, uid]):
        return MissingInformation()
    if not validator.is_valid([[users, list]]):
        return InvalidParameters()

    try:
        user_accounts = []
        for user in users:
            _user = user.get("user")
            is_personal = user.get("is_personal")
            for_location = user.get("for_location")
            user_account = Account.objects.create(
                user=_user,
                is_personal=is_personal,
                created_by=uid,
                forLocation=for_location
            )
            user_account.save()
            user_accounts.append(user_account)

        user_account_serializer = AccountSerializer(user_accounts, many=True)

        response_data = user_account_serializer.data
        return Success(response_data, status=True)

    except:
        return ServerProcessingError()


class AdminAccounts(APIView):
    def get(self, request, format=None):
        token = request.headers.get("Authorization")
        uid = get_uid_from_token(token=token)

        logger.debug("\n\n\n\nGetting the users!")

        try:
            user_accounts = Account.objects.filter(
                created_by=uid,
            ).exclude(id=uid).all()

            user_accounts_serializer = AccountSerializer(
                user_accounts, many=True)

            response_data = user_accounts_serializer.data
            return Success(response_data)

        except:
            return ServerProcessingError()

    def delete(self, request, format=None):
        accounts = request.data.get("accounts")

        logger.debug("\n\n\n\nAccount deletion initiation 000: "+str(accounts))

        if validator.is_missing([accounts]):
            return MissingInformation()
        if not validator.is_valid([[accounts, list]]):
            return InvalidParameters()
        try:
            logger.debug("\n\n\n\nAccount deletion initiation: "+str(accounts))
            for account in accounts:
                user_account = Account.objects.filter(id=int(account)).first()

                if not user_account:
                    continue

                username = user_account.user

                user_account.delete()

                logger.debug("Account deleted")

                try: 
                    last_run_obj = LastRun.objects.get(account=username)

                    logger.debug("About to check if lastRun exists")
                    
                    if not last_run_obj:
                        logger.debug("lastRun didnt exist")
                        continue

                    logger.debug("lastRun did exist")

                    last_run_obj.delete()

                    logger.debug("lastRun deleted")
                except Exception as e:
                    logger.debug("Excep: lastRun didnt exist")
                
            return Success()
        except Exception as e:
            logger.debug("Error during account deletion: "+str(e))

            return ServerProcessingError(message="Error during account deletion: "+str(e))

class AdminRunScraper(APIView):
    def download_images_thread(self, accounts, session_id, headers, config, exec_id):
        try:
            #download_images(accounts=accounts, session_id=session_id, headers=headers, config=config, exec_id=exec_id)
            clean_download_images(accounts=accounts, exec_id=exec_id, headers=headers)
        except Exception as e:
            logger.debug("Error during event population: "+str(e))

    def post(self, request, format=None):
        try:
            logger.debug("\n\n\n Run scraper request received")

            accounts = request.data.get("accounts")

            headers = get_headers()

            if len(accounts) > 0:
                config = get_config(headers)

                if not accounts:
                    raise ValueError('No accounts to scrape')

                # Fetch full account objects instead of just usernames
                full_accounts = []
                for account_username in accounts:
                    account_objs = Account.objects.filter(user=account_username).all()
                    if account_objs:
                        # Collect all forLocation values from multiple accounts
                        for_locations = [
                            acc.forLocation for acc in account_objs 
                            if acc.forLocation
                        ]
                        # Combine locations (remove duplicates)
                        combined_location = ','.join(set(for_locations)) if for_locations else None
                        
                        full_accounts.append({
                            'user': account_username,
                            'forLocation': combined_location
                        })
                    else:
                        # If account doesn't exist, still use dict format so scraper loop sees all accounts
                        full_accounts.append({
                            'user': account_username,
                            'forLocation': None
                        })

                exec_id = get_exec()

                thread = Thread(target=self.download_images_thread, args=(full_accounts, "test", headers, config, exec_id))
                thread.start()
                
                return Success(data={"id":exec_id})

            return Success(data={"message":"1.."})
        except Exception as e:
            logger.debug("\n\n\n Run scraper problem: "+str(e))

            return Success(data={"message":str(e)})

class AdminPreferences(APIView):
    def put(self, request, format=None):
        use = request.data.get("use")
        persistence_day_count = request.data.get("persistence_day_count")
        prompt = request.data.get("prompt")

        if validator.is_missing([use, persistence_day_count]):
            return MissingInformation()
        try:
            if not validator.is_valid([[use, str], [persistence_day_count, int]]):
                raise ValueError()
        except ValueError:
            return InvalidParameters()

        try:
            update_data_persistence_value(use, persistence_day_count, prompt)
            return Success()
        except:
            return ServerProcessingError()

    def get(self, request, format=None):
        try:
            preferences_data = get_data_persistence_value()

            return Success(preferences_data, status=True)
        except:
            return ServerProcessingError()


@api_view(["GET"])
def read_logs(request):
    last_fetched = request.GET.get("last_fetched")

    try:
        if last_fetched:
            try:
                last_fetched = float(last_fetched)/1000
            except:
                return InvalidParameters()

            logs = Logs.objects.filter(scraped_at__gt=last_fetched).all()
        else:
            logs = Logs.objects.all()

        # Get the most recent "In Progress" log
        latest_in_progress = Logs.objects.filter(status="In Progress").order_by('-scraped_at').first()
        
        # Get the last 500 logs ordered by scraped_at
        recent_logs = Logs.objects.all().order_by('-scraped_at')[:500]
        
        # Combine and deduplicate
        all_logs = list(recent_logs)
        if latest_in_progress and latest_in_progress not in all_logs:
            all_logs.append(latest_in_progress)
        
        # Sort by scraped_at descending to maintain chronological order
        all_logs.sort(key=lambda x: x.scraped_at or 0, reverse=True)
        
        # Ensure we keep the "In Progress" log even if it's older than the 500th log
        if latest_in_progress:
            # Remove the "In Progress" log from the list temporarily
            all_logs = [log for log in all_logs if log.id != latest_in_progress.id]
            # Take 499 most recent logs
            all_logs = all_logs[:499]
            # Add the "In Progress" log back at the beginning
            all_logs.insert(0, latest_in_progress)
        else:
            # If no "In Progress" log, just take 500 most recent
            all_logs = all_logs[:500]
        
        logs = all_logs[::-1]  # Reverse the order (oldest first)

        logs_serializer = LogsSerializer(logs, many=True)

        response_data = logs_serializer.data
        return Success(response_data, status=True)
    except Exception as e:
        return ServerProcessingError(message="An error occurred while reading logs: "+str(e))


@api_view(["POST"])
def save_logs(request):
    logs = request.data.get("logs")

    if validator.is_missing([logs]):
        return MissingInformation()
    if not validator.is_valid([[logs, dict]]):
        return InvalidParameters()

    scraped_at = logs.get("scrapedAt")
    scraped_by = logs.get("scrapedBy")
    number_of_new_images = logs.get("numberOfNewImages")
    number_of_accounts = logs.get("numberOfAccounts")

    """logs = Logs.objects.create(
        scraped_at=scraped_at,
        scraped_by=scraped_by,
        number_of_new_images=int(number_of_new_images),
        number_of_accounts=int(number_of_accounts)
    )
    logs.save()"""

    return Success()

@api_view(["POST"])
def upload_image(request):
    image = request.FILES.get("image")

    if not image:
        return MissingInformation()
    
    try:
        current_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        image_path = f"/tmp/{current_timestamp}_{image.name}" 
        with open(image_path, "wb") as file:
            file.write(image.read())

        file_name = image.name
            
        try:
            image_url = saveImage("-1", "admin", file_name, image_path, "https://eventtracker.lafaslist.com")
            return Success({"image_url": image_url})
        except Exception as e:
            return ServerProcessingError(message="An error occurred while saving the image: "+str(e))
    
    except Exception as e:
        return ServerProcessingError(message="An error occurred while saving the image: "+str(e))

@api_view(["POST"])
def create_event_from_dashboard(request):
    single_image = request.FILES.get("single_image")

    if not single_image:
        return MissingInformation()

    try:
        current_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        image_path = f"/tmp/{current_timestamp}_{single_image.name}" 
        with open(image_path, "wb") as file:
            file.write(single_image.read())

        account = "admin_user"
        exec_id = "-1"
        output_file_path = f"{current_timestamp}"
        image_url = image_path
        headers = get_headers()

        # Since this is from dashboard, we don't have a specific account forLocation
        for_location = request.data.get("for_location")

        if not for_location:
            for_location = None

        saved_events = forced_label_and_save(account, exec_id, output_file_path, image_url, headers, for_location)

        return Success({"saved_events": saved_events})
    except Exception as e:
        return ServerProcessingError(message="An error occurred persisting the event: "+str(e))


@api_view(["POST"])
def create_event_from_instagram_link(request):
    instagram_url = request.data.get("instagram_url")

    if not instagram_url:
        return MissingInformation()

    try:
        # Validate Instagram URL format
        if not ("instagram.com" in instagram_url):
            return InvalidParameters()

        # Use Apify to scrape Instagram post data
        apify_api_key = os.getenv("APIFY_API_KEY")
        if not apify_api_key:
            return ServerProcessingError(message="Apify API key not configured")

        from apify_client import ApifyClient
        
        client = ApifyClient(apify_api_key)
        
        # Use Instagram Post Scraper to get post details
        run_input = {
            "directUrls": [instagram_url],
            "resultsType": "posts",
            "resultsLimit": 1,
        }

        logger.debug(f"Scraping Instagram URL: {instagram_url}")
        run = client.actor("apify/instagram-scraper").call(run_input=run_input)

        # Get the scraped data
        post_data = None
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            post_data = item
            break

        if not post_data:
            return ServerProcessingError(message="Could not scrape Instagram post data")

        # Ticket 2: read EVERY slide of the post, not just displayUrl. Previously
        # only the cover image was used and `type == "Sidecar"` was never
        # checked, so pasting a carousel URL could only ever yield one event.
        slide_urls = slide_image_urls(post_data)
        if not slide_urls:
            return ServerProcessingError(message="No image found in Instagram post")

        # Skip blacklisted posts (guard preserved from the previous implementation).
        if is_link_blacklisted(instagram_url):
            return Success({"saved_events": [],
                            "message": "This post is blacklisted."})

        caption = post_data.get("caption", "")
        owner_username = post_data.get("ownerUsername", "instagram_user")
        # Parse the URL rather than splitting on '/': share links carry
        # ?igsh=... which would otherwise become part of the shortcode and give
        # a different source_key on every paste.
        shortcode = post_shortcode(post_data) or shortcode_from_url(instagram_url)
        if not shortcode:
            return ServerProcessingError(message="Could not determine the Instagram post id")

        current_timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        account = f"instagram_{owner_username}"
        exec_id = "-1"
        output_file_path = f"{current_timestamp}"
        headers = get_headers()

        for_location = request.data.get("for_location") or None

        # Mirror every slide to durable storage (Instagram CDN URLs expire, and
        # the stored orig_thumb has to keep working).
        hosted_urls, _originals = mirror_slides(
            slide_urls, exec_id=exec_id, user=account,
            output_file_path=output_file_path,
            downloader=download_and_save_image, uploader=saveImage)
        if not hosted_urls:
            return ServerProcessingError(message="Failed to download image from Instagram")

        logger.info("[CAROUSEL_MANUAL] shortcode=%r slides=%d hosted=%d",
                    shortcode, len(slide_urls), len(hosted_urls))

        # ONE structured-output vision call over all slides -> an ARRAY of
        # events with per-event source_slide_index (replaces the old free-text
        # prompt whose `subEvents` was requested but never parsed).
        extraction = extract_events(
            openai_client, hosted_urls, caption=caption,
            biography=post_data.get("ownerFullName", ""), external_url="")

        payloads = build_payloads(
            extraction, shortcode=shortcode, post_link=instagram_url,
            slide_urls=hosted_urls, for_location=for_location,
            poster=owner_username)
        payloads = [p for p in payloads if p.get("isEvent")]

        logger.info("[CAROUSEL_MANUAL] shortcode=%r post_type=%s extracted=%d kept=%d",
                    shortcode, extraction.post_type, len(extraction.events), len(payloads))

        if not payloads:
            return Success({"saved_events": [], "post_type": extraction.post_type,
                            "message": "No events found in this post."})

        # AdminEvent.post derives the positional source_key from shortcode +
        # sourceSlideIndex and upserts, so re-pasting the same URL updates rows
        # instead of inserting duplicates.
        saved_events = save_events_from_dashboard(
            headers, {"events": payloads}, exec_id, [account])

        return Success({"saved_events": saved_events,
                        "post_type": extraction.post_type,
                        "events_found": len(payloads)})
    except Exception as e:
        logger.error(f"Error creating event from Instagram link: {str(e)}")
        return ServerProcessingError(message="An error occurred processing the Instagram link: "+str(e))


@api_view(["GET"])
def geocode_address(request):
    """
    Geocode an address using Google Maps API with caching to reduce API costs.
    Returns cached results if available, otherwise calls Google Maps API and caches the result.
    """
    address = request.GET.get("address")
    
    if not address:
        return MissingInformation()
    
    try:
        # Check if we have a cached result
        cached_result = GeocodingCache.objects.filter(address=address).first()
        
        if cached_result:
            logger.debug(f"Returning cached geocoding result for: {address}")
            return Success({
                "latitude": cached_result.latitude,
                "longitude": cached_result.longitude,
                "formatted_address": cached_result.formatted_address,
                "place_id": cached_result.place_id,
                "cached": True,
                "cached_at": cached_result.cached_at.isoformat()
            })
        
        # If no cached result, call Google Maps API
        logger.debug(f"Calling Google Maps API for: {address}")
        
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {
            "address": address,
            "key": GOOGLE_MAPS_API_KEY
        }
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            geometry = result["geometry"]["location"]
            
            # Extract coordinates and additional data
            latitude = geometry["lat"]
            longitude = geometry["lng"]
            formatted_address = result.get("formatted_address")
            place_id = result.get("place_id")
            
            # Cache the result
            try:
                cache_entry = GeocodingCache.objects.create(
                    address=address,
                    latitude=latitude,
                    longitude=longitude,
                    formatted_address=formatted_address,
                    place_id=place_id
                )
                cache_entry.save()
                logger.debug(f"Cached geocoding result for: {address}")
            except Exception as e:
                logger.warning(f"Failed to cache geocoding result: {str(e)}")
            
            return Success({
                "latitude": latitude,
                "longitude": longitude,
                "formatted_address": formatted_address,
                "place_id": place_id,
                "cached": False
            })
        else:
            error_message = data.get("error_message", "Geocoding failed")
            logger.error(f"Google Maps API error: {error_message}")
            return ServerProcessingError(message=f"Geocoding failed: {error_message}")
            
    except requests.RequestException as e:
        logger.error(f"Request error during geocoding: {str(e)}")
        return ServerProcessingError(message=f"Request error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during geocoding: {str(e)}")
        return ServerProcessingError(message=f"Unexpected error: {str(e)}")


@api_view(["GET"])
def get_cached_geocoding_stats(request):
    """
    Get statistics about cached geocoding results.
    Useful for monitoring cache usage and effectiveness.
    """
    try:
        total_cached = GeocodingCache.objects.count()
        oldest_cache = GeocodingCache.objects.order_by('cached_at').first()
        newest_cache = GeocodingCache.objects.order_by('cached_at').last()
        
        # Get cache hit rate (this would need to be implemented with request tracking)
        stats = {
            "total_cached_addresses": total_cached,
            "oldest_cache_entry": oldest_cache.cached_at.isoformat() if oldest_cache else None,
            "newest_cache_entry": newest_cache.cached_at.isoformat() if newest_cache else None,
        }
        
        return Success(stats)
    except Exception as e:
        logger.error(f"Error getting geocoding stats: {str(e)}")
        return ServerProcessingError(message=f"Error getting stats: {str(e)}")


@api_view(["DELETE"])
def clear_geocoding_cache(request):
    """
    Clear all cached geocoding results.
    Use with caution as this will force new API calls for all addresses.
    """
    try:
        deleted_count = GeocodingCache.objects.all().delete()[0]
        logger.info(f"Cleared {deleted_count} cached geocoding results")
        return Success({"deleted_count": deleted_count})
    except Exception as e:
        logger.error(f"Error clearing geocoding cache: {str(e)}")
        return ServerProcessingError(message=f"Error clearing cache: {str(e)}")


class AdminExecutions(APIView):
    def get(self, request, format=None):
        try:
            executions = Execution.objects.all()

            executions_serializer = ExecutionSerializer(
                executions, many=True)

            response_data = executions_serializer.data
            return Success(response_data)

        except:
            return ServerProcessingError()

    def post(self, request, format=None):
        status = request.data.get("status")

        try:
            execObj = Execution.objects.create(
                status=status
            )
            execObj.save()

            execObj_serializer = ExecutionSerializer(
                execObj, many=False)

            response_data = execObj_serializer.data
            return Success(response_data)
        except:
            return ServerProcessingError()


class AdminConfig(APIView):
    def get(self, request, format=None):
        try:
            config = db.child('/').get()

            return Success(dict(config.val()))
        except:
            return ServerProcessingError()

    def put(self, request, format=None):
        is_complete = request.data.get("is_complete")
        config = request.data.get("config")

        logger.debug("Debugging inputs for admin config update:")
        logger.debug(str(is_complete))
        logger.debug(str(config))

        try:
            if (is_complete):
                db.child('/').update(config)
            else:
                executions = config['executions']
                execution_id = list(dict(executions).keys())[0]

                logger.debug(str(execution_id))

                users = executions[execution_id]['users']
                user_account = list(dict(users).keys())[0]

                logger.debug(str(user_account))

                db.child(
                    f"/executions/{execution_id}/users/{user_account}").update(users[user_account])

            logger.debug("Success")

            return Success()
        except Exception as e:
            logger.debug("Error updating config: ")
            logger.debug(str(e))
            return ServerProcessingError(message=str(e))


class AdminKeywords(APIView):
    def get(self, request, format=None):
        try:
            keywords = Keywords.objects.all()

            keywords_serializer = KeywordsSerializer(
                keywords, many=True)

            keywords_list = keywords_serializer.data

            keywords_res = {
                'Event Name': [],
                'Event Price': [],
                'Venue': [],
                'Location': [],
                'Event Date': [],
                'Event Time': [],
                'Artist': [],
                'With/Opener': [],
                'Host': [],
                'Promoter': [],
                'Offering': [],
            }

            for keyword in keywords_list:
                keyword = dict(keyword)
                keywords_res[keyword['col_name']
                             ] = json.loads(keyword['value'])

            return Success(data=keywords_res, status=True)
        except:
            return ServerProcessingError()

    def put(self, request, format=None):
        column_name = request.data.get("column_name")
        keywords = request.data.get("keywords")

        if validator.is_missing([column_name, keywords]):
            return MissingInformation()

        try:
            if not validator.is_valid([[column_name, str], [keywords, list]]):
                raise ValueError()
        except ValueError:
            return InvalidParameters()

        try:
            column = Keywords.objects.filter(col_name=column_name).first()

            if not column:
                column = Keywords.objects.create(
                    col_name=column_name,
                    value=json.dumps(keywords)
                )
            else:
                column.value = json.dumps(keywords)

            column.save()

            return Success()
        except:
            return ServerProcessingError()


class AdminErrorsNotifs(APIView):
    def get(self, request, format=None):
        try:
            last_error = Feedback.objects.last()

            last_seen_error = db.child('/last_seen_error').get()

            if int(last_seen_error.val()) < last_error.id:
                return Success(data={'has_errors': True}, status=True)

            return Success(data={'has_errors': False}, status=True)
        except:
            return Success(data={'has_errors': False}, status=True)

    def put(self, request, format=None):
        last_seen_error = request.data.get("last_seen_error")

        try:
            db.child("/last_seen_error").set(last_seen_error)

            return Success(status=True)
        except:
            return ServerProcessingError()


class AdminErrors(APIView):
    def get(self, request, format=None):
        try:
            errors = Feedback.objects.all()

            errors_response = FeedbackSerializer(errors, many=True)

            errors_data = errors_response.data

            all_events = {}

            for error in errors:
                if error.event.id not in all_events:
                    all_events[error.event.id] = dict(EventSerializer(
                        error.event).data)

            for error in errors_data:
                error['event'] = all_events[error['event']]

            return Success(data=errors_data, status=True)
        except Exception as e:
            return ServerProcessingError()

    def delete(self, request, format=None):
        feedback_id = request.data.get("id")

        try:
            error = Feedback.objects.get(id=feedback_id)

            error.delete()

            return Success(status=True)
        except:
            return ServerProcessingError()


class AdminFeedback(APIView):
    def post(self, request, format=None):
        email = request.data.get("email")
        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        text = request.data.get("text")

        try:
            feedback = UserFeedback(
                email=email,
                first_name=first_name,
                last_name=last_name,
                text=text
            )
            feedback.save()

            return Success(data={'id': feedback.id}, status=True)
        except Exception as e:
            logger.error(f"Error adding feedback: {str(e)}")
            return ServerProcessingError()


    def get(self, request, format=None):
        try:
            feedbacks = UserFeedback.objects.all()
            feedbacks_data = UserFeedbackSerializer(feedbacks, many=True).data
            return Success(data=feedbacks_data, status=True)
        except Exception as e:
            logger.error(f"Error retrieving feedbacks: {str(e)}")
            return ServerProcessingError()


class AdminAccountDetails(APIView):
    """
    CRUD for per-account field overrides.
    Each detail has a field_name, value, and mode (enforce | fallback).
    - enforce: always overwrites the AI-extracted value for that field
    - fallback: only used when the AI extracted nothing / null
    """

    VALID_MODES = ('enforce', 'fallback')
    VALID_FIELDS = [c[0] for c in DETAIL_FIELD_CHOICES]

    def get(self, request, format=None):
        account_id = request.GET.get('account_id')
        try:
            if account_id:
                try:
                    account_id = int(account_id)
                except (ValueError, TypeError):
                    return InvalidParameters()
                details = AccountDetail.objects.filter(account_id=account_id).select_related('account')
            else:
                details = AccountDetail.objects.all().select_related('account')

            serializer = AccountDetailSerializer(details, many=True)
            return Success(data=serializer.data)
        except Exception as e:
            logger.error(f"Error fetching account details: {str(e)}")
            return ServerProcessingError(message=str(e))

    def post(self, request, format=None):
        account_id = request.data.get('account_id')
        field_name = request.data.get('field_name')
        value = request.data.get('value')
        mode = request.data.get('mode', 'fallback')

        if validator.is_missing([account_id, field_name, value, mode]):
            return MissingInformation()

        if field_name not in self.VALID_FIELDS:
            return InvalidParameters()
        if mode not in self.VALID_MODES:
            return InvalidParameters()

        try:
            account = Account.objects.get(id=int(account_id))
        except (Account.DoesNotExist, ValueError, TypeError):
            return ServerProcessingError(message='Account not found')

        try:
            detail, _ = AccountDetail.objects.update_or_create(
                account=account,
                field_name=field_name,
                defaults={'value': value, 'mode': mode}
            )
            return Success(data=AccountDetailSerializer(detail).data)
        except Exception as e:
            logger.error(f"Error creating account detail: {str(e)}")
            return ServerProcessingError(message=str(e))

    def put(self, request, format=None):
        detail_id = request.data.get('id')
        value = request.data.get('value')
        mode = request.data.get('mode')

        if validator.is_missing([detail_id]):
            return MissingInformation()

        if mode is not None and mode not in self.VALID_MODES:
            return InvalidParameters()

        try:
            detail = AccountDetail.objects.get(id=int(detail_id))
            if value is not None:
                detail.value = value
            if mode is not None:
                detail.mode = mode
            detail.save()
            return Success(data=AccountDetailSerializer(detail).data)
        except AccountDetail.DoesNotExist:
            return ServerProcessingError(message='Detail not found')
        except Exception as e:
            logger.error(f"Error updating account detail: {str(e)}")
            return ServerProcessingError(message=str(e))

    def delete(self, request, format=None):
        detail_id = request.data.get('id')

        if validator.is_missing([detail_id]):
            return MissingInformation()

        try:
            detail = AccountDetail.objects.get(id=int(detail_id))
            detail.delete()
            return Success()
        except AccountDetail.DoesNotExist:
            return ServerProcessingError(message='Detail not found')
        except Exception as e:
            logger.error(f"Error deleting account detail: {str(e)}")
            return ServerProcessingError(message=str(e))


@api_view(["GET"])
def list_detail_fields(request):
    """Returns the list of supported field names and their labels."""
    fields = [{'value': k, 'label': v} for k, v in DETAIL_FIELD_CHOICES]
    return Success(data=fields)

