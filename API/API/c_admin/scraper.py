from collections import defaultdict
import subprocess
import requests
import time
from datetime import datetime, timedelta
import json
import re
import os
import math
import shutil
import base64
import threading
from django.utils import timezone

from .constants import *
from .exceptions import *

from apify_client import ApifyClient
from PIL import Image
from io import BytesIO
import imageio

from openai import OpenAI

from celery import shared_task
from tenacity import retry, stop_after_attempt, wait_fixed
from concurrent.futures import ThreadPoolExecutor, as_completed

from .models import *
from event.models import Event, BlacklistedLink

from fuzzywuzzy import fuzz

import traceback

import logging
logger = logging.getLogger('django')

# High-visibility log tag for the Instagram stories code path (separate Apify run).
STORY_SCRAPER_LOG_TAG = "[INSTAGRAM_STORIES]"

# ---------------------------------------------------------------------------
# Stories-scraping subset control
# Set STORIES_SCRAPE_MODE = "all"    → fetch stories for every account
# Set STORIES_SCRAPE_MODE = "subset" → fetch stories only for STORIES_SUBSET_ACCOUNTS
# ---------------------------------------------------------------------------
STORIES_SCRAPE_MODE = "subset"   # "all" | "subset"
STORIES_SUBSET_ACCOUNTS = {
    "justineswinebar",
    "cafetondo",
    "10highdesign",
}


def _story_log_banner(account, title, extra_lines=None):
    """Multi-line INFO banner so story scraping is easy to spot in logs."""
    bar = "=" * 78
    lines = extra_lines or []
    logger.info(bar)
    logger.info("%s %s | account=%r", STORY_SCRAPER_LOG_TAG, title, account)
    for line in lines:
        logger.info("%s   %s", STORY_SCRAPER_LOG_TAG, line)
    logger.info(bar)


from django.conf import settings
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv(dotenv_path=os.path.join(settings.BASE_DIR, '.env.local'))

client = OpenAI()

def check_for_prerequisites():
    prerequisites = ["instatouch"]
    try:
        for prerequisite in prerequisites:
            subprocess.call([prerequisite],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.STDOUT)
    except FileNotFoundError:
        return False
    return True


def get_number_of_posts_downloaded(file_path):
    try:
        with open(file_path, "r") as downloaded_posts_file:
            download_posts_data = json.loads(downloaded_posts_file.read())
            return len(download_posts_data)
    except:
        return 0


def get_display_url_for_images(file_path, min_time):
    try:
        posts_data = []
        with open(file_path, "r") as posts_file:
            posts_data = json.loads(posts_file.read())

        images = {}
        for post in posts_data:
            if post['taken_at_timestamp'] > min_time:
                shortcode = post.get('shortcode')
                if not shortcode:
                    continue
                images[shortcode] = {
                    "image_url": post.get('display_url') or post.get('baseImageUrl'),
                    # Prefer the stored post link (important for carousel items where shortcode may be suffixed)
                    "link": post.get("link") or f"https://www.instagram.com/p/{post.get('parent_shortcode') or shortcode}/"
                }

        return images
    except Exception as e:
        print("An error: ",str(e))
        return {}


def get_path_for_images(account, file_path, min_time):
    try:
        posts_data = []
        with open(file_path, "r") as posts_file:
            posts_data = json.loads(posts_file.read())

        images = {}
        for post in posts_data:
            if post['taken_at_timestamp'] > min_time:
                shortcode = post.get('shortcode')
                if not shortcode:
                    continue
                images[shortcode] = {
                    "path": f"./posters/{account}/{shortcode}.jpeg",
                    # Prefer the stored post link (important for carousel items where shortcode may be suffixed)
                    "link": post.get("link") or f"https://www.instagram.com/p/{post.get('parent_shortcode') or shortcode}/"
                }

        return images
    except:
        return {}

def convert_timestamp_to_float(timestamp_str):
    try:
        timestamp_dt = datetime.strptime(timestamp_str, '%Y-%m-%dT%H:%M:%S.%fZ')

        timestamp_float = timestamp_dt.timestamp()

        return timestamp_float
    except ValueError as e:
        print(f"Error: {e}")
        return None


def parse_item_timestamp_to_float(timestamp):
    """Coerce Instagram / Apify timestamps (ISO string or unix seconds/ms) to epoch seconds."""
    if timestamp is None:
        return None
    if isinstance(timestamp, (int, float)):
        ts = float(timestamp)
        if ts > 1e12:
            ts /= 1000.0
        return ts
    if isinstance(timestamp, str):
        try:
            return float(timestamp)
        except ValueError:
            pass
        try:
            parsed = convert_timestamp_to_float(timestamp)
            if parsed is not None:
                return parsed
        except Exception:
            pass
        try:
            normalized = timestamp.replace("Z", "+00:00") if timestamp.endswith("Z") else timestamp
            return datetime.fromisoformat(normalized).timestamp()
        except (ValueError, TypeError):
            return None
    return None


def _unix_ts_to_iso_z(ts):
    if ts is None:
        ts = time.time()
    return datetime.utcfromtimestamp(float(ts)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def instagram_username_clean(account):
    if not account:
        return ""
    return account.strip().lstrip("@")


def _story_primary_id(item):
    """Instagram story media identifier (used in /stories/{user}/{id}/)."""
    for key in ("pk", "id", "mediaPk", "media_pk", "code", "shortCode"):
        val = item.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def _first_video_version_url(item):
    vv = item.get("videoVersions") or item.get("video_versions")
    if not vv or not isinstance(vv, list):
        return None
    for v in reversed(vv):
        if isinstance(v, dict) and v.get("url"):
            return v["url"]
        if isinstance(v, str):
            return v
    return None


def _first_display_url_from_item(item):
    u = item.get("displayUrl") or item.get("display_url") or item.get("thumbnailUrl") or item.get("thumbnail_src")
    if u:
        return u
    imgs = item.get("images")
    if isinstance(imgs, list) and imgs:
        return imgs[0] if isinstance(imgs[0], str) else (imgs[0] or {}).get("url")
    return None


def _story_caption_from_item(item):
    return (
        item.get("caption")
        or item.get("accessibilityCaption")
        or item.get("accessibility_caption")
        or ""
    )


def _infer_story_media_kind(item):
    """Return 'Image', 'Video', or 'Sidecar' for Apify instagram-scraper story rows."""
    raw = (item.get("type") or item.get("mediaType") or item.get("productType") or "").strip()
    t = raw.lower()
    if t == "sidecar" or (item.get("images") and len(item.get("images") or []) > 1):
        return "Sidecar"
    if t == "video" or item.get("videoUrl") or _first_video_version_url(item):
        return "Video"
    if t in ("image", "photo", "") and (_first_display_url_from_item(item) or item.get("images")):
        if item.get("images") and len(item["images"]) > 1:
            return "Sidecar"
        return "Image"
    if item.get("videoUrl") or _first_video_version_url(item):
        return "Video"
    if _first_display_url_from_item(item):
        return "Image"
    return None


def normalize_apify_story_item_to_post_shape(item, ig_username):
    """
    Map a dataset row from apify/instagram-scraper (resultsType=stories) into the
    shape expected by process_post, plus a canonical story viewer URL.
    Never raises: returns None on any failure.
    """
    try:
        if not isinstance(item, dict):
            logger.debug(
                "%s normalize skip | ig_username=%r reason=non_dict_row type=%r",
                STORY_SCRAPER_LOG_TAG,
                ig_username,
                type(item).__name__,
            )
            return None
        kind = _infer_story_media_kind(item)
        if not kind:
            logger.debug(
                "%s normalize skip | ig_username=%r reason=no_media_kind keys=%r",
                STORY_SCRAPER_LOG_TAG,
                ig_username,
                list(item.keys())[:30],
            )
            return None
        media_id = _story_primary_id(item)
        if not media_id:
            logger.debug(
                "%s normalize skip | ig_username=%r reason=no_media_id keys=%r",
                STORY_SCRAPER_LOG_TAG,
                ig_username,
                list(item.keys())[:30],
            )
            return None
        safe_id = re.sub(r"[^\w\-.]", "_", media_id)[:120]
        shortcode = f"story_{safe_id}"
        ts = parse_item_timestamp_to_float(
            item.get("timestamp")
            or item.get("takenAtTimestamp")
            or item.get("taken_at")
            or item.get("takenAt")
        )
        timestamp_iso = _unix_ts_to_iso_z(ts if ts is not None else time.time())
        caption = _story_caption_from_item(item) or ""
        story_link = f"https://www.instagram.com/stories/{ig_username}/{media_id}/"
        base = {"shortCode": shortcode, "timestamp": timestamp_iso, "caption": caption}
        if kind == "Sidecar":
            images = item.get("images") or []
            if not images:
                logger.debug(
                    "%s normalize skip | ig_username=%r reason=sidecar_no_images media_id=%r",
                    STORY_SCRAPER_LOG_TAG,
                    ig_username,
                    media_id,
                )
                return None
            base["type"] = "Sidecar"
            base["images"] = images
        elif kind == "Video":
            video_url = item.get("videoUrl") or _first_video_version_url(item)
            if not video_url:
                du = _first_display_url_from_item(item)
                if not du:
                    logger.debug(
                        "%s normalize skip | ig_username=%r reason=video_no_urls media_id=%r",
                        STORY_SCRAPER_LOG_TAG,
                        ig_username,
                        media_id,
                    )
                    return None
                base["type"] = "Image"
                base["displayUrl"] = du
            else:
                base["type"] = "Video"
                base["videoUrl"] = video_url
        else:
            du = _first_display_url_from_item(item)
            if not du:
                logger.debug(
                    "%s normalize skip | ig_username=%r reason=image_no_display_url media_id=%r",
                    STORY_SCRAPER_LOG_TAG,
                    ig_username,
                    media_id,
                )
                return None
            base["type"] = "Image"
            base["displayUrl"] = du
        base["_story_link"] = story_link
        return base
    except Exception as e:
        keys_sample = list(item.keys())[:30] if isinstance(item, dict) else None
        logger.warning(
            "%s normalize exception (skipping one row) | ig_username=%r err=%s keys_sample=%r",
            STORY_SCRAPER_LOG_TAG,
            ig_username,
            e,
            keys_sample,
            exc_info=True,
        )
        return None


def fetch_story_image_objects(client, account, biography, externalUrl, last_fetched):
    """
    Scrape active Instagram stories for a public profile via apify/instagram-scraper
    (same actor as create_event_from_instagram_link), then build the same imageObjects
    used for posts (GPT labeling, save flow).

    Never raises: on any failure returns [] so the legacy post scrape path is unaffected.
    """
    username = instagram_username_clean(account)
    if not username:
        logger.info(
            "%s SKIP entire story phase | account=%r reason=empty_username_after_clean",
            STORY_SCRAPER_LOG_TAG,
            account,
        )
        return []
    image_objects = []
    dataset_rows = 0
    story_rows = 0
    normalized_ok = 0
    process_ok = 0
    process_fail = 0
    skipped_normalize = 0

    _story_log_banner(
        account,
        "STORY_PHASE_START",
        [
            f"ig_username={username!r}",
            f"actor=apify/instagram-scraper resultsType=stories",
            f"directUrl=https://www.instagram.com/{username}/",
            f"last_fetched={last_fetched!r} (stories older than this are skipped inside process_post)",
        ],
    )

    try:
        if client is None:
            logger.warning(
                "%s STORY_PHASE_ABORT | account=%r reason=apify_client_is_none",
                STORY_SCRAPER_LOG_TAG,
                account,
            )
            return []

        run_input = {
            "resultsType": "stories",
            "directUrls": [f"https://www.instagram.com/{username}/"],
        }
        try:
            run = client.actor("apify/instagram-scraper").call(run_input=run_input)
        except Exception as e:
            logger.warning(
                "%s Apify actor call FAILED (story phase skipped; posts unaffected) | account=%r err=%s",
                STORY_SCRAPER_LOG_TAG,
                account,
                e,
                exc_info=True,
            )
            _story_log_banner(
                account,
                "STORY_PHASE_END",
                ["outcome=ABORTED_AT_ACTOR_CALL", "image_objects=0"],
            )
            return []

        run_id = run.get("id") if isinstance(run, dict) else None
        dataset_id = run.get("defaultDatasetId") if isinstance(run, dict) else None
        logger.info(
            "%s Apify run finished | account=%r run_id=%r defaultDatasetId=%r",
            STORY_SCRAPER_LOG_TAG,
            account,
            run_id,
            dataset_id,
        )

        try:
            iterator = client.dataset(run["defaultDatasetId"]).iterate_items()
        except Exception as e:
            logger.warning(
                "%s dataset iterator FAILED (story phase skipped) | account=%r err=%s",
                STORY_SCRAPER_LOG_TAG,
                account,
                e,
                exc_info=True,
            )
            _story_log_banner(
                account,
                "STORY_PHASE_END",
                ["outcome=ABORTED_AT_DATASET_ITERATOR", "image_objects=0"],
            )
            return []

        for raw in iterator:
            dataset_rows += 1
            try:
                if not isinstance(raw, dict):
                    logger.info(
                        "%s dataset row %d | account=%r skip=non_dict type=%r repr=%r",
                        STORY_SCRAPER_LOG_TAG,
                        dataset_rows,
                        account,
                        type(raw).__name__,
                        raw if isinstance(raw, (str, int, float)) else type(raw).__name__,
                    )
                    continue
                nested = raw.get("stories") if isinstance(raw.get("stories"), list) else None
                rows = nested if nested else [raw]
                if not rows:
                    logger.info(
                        "%s dataset row %d | account=%r skip=empty_rows_list",
                        STORY_SCRAPER_LOG_TAG,
                        dataset_rows,
                        account,
                    )
                    continue
                if nested:
                    logger.info(
                        "%s dataset row %d | account=%r nested_stories=%d",
                        STORY_SCRAPER_LOG_TAG,
                        dataset_rows,
                        account,
                        len(rows),
                    )
                else:
                    logger.info(
                        "%s dataset row %d | account=%r shape=flat_story_item keys=%r",
                        STORY_SCRAPER_LOG_TAG,
                        dataset_rows,
                        account,
                        list(raw.keys())[:25] if isinstance(raw, dict) else type(raw).__name__,
                    )
            except Exception as e:
                logger.warning(
                    "%s dataset row %d unpack FAILED (skipping row) | account=%r err=%s",
                    STORY_SCRAPER_LOG_TAG,
                    dataset_rows,
                    account,
                    e,
                    exc_info=True,
                )
                continue

            for row in rows:
                story_rows += 1
                try:
                    shaped = normalize_apify_story_item_to_post_shape(row, username)
                except Exception as e:
                    process_fail += 1
                    logger.warning(
                        "%s normalize raised unexpectedly (skipping) | account=%r err=%s",
                        STORY_SCRAPER_LOG_TAG,
                        account,
                        e,
                        exc_info=True,
                    )
                    continue
                if not shaped:
                    skipped_normalize += 1
                    continue
                normalized_ok += 1
                story_link = shaped.pop("_story_link", None)
                kind = shaped.get("type")
                sc = shaped.get("shortCode")
                logger.info(
                    "%s process_post ← story | account=%r shortCode=%r type=%r link=%r",
                    STORY_SCRAPER_LOG_TAG,
                    account,
                    sc,
                    kind,
                    story_link,
                )
                try:
                    added = process_post(
                        shaped, account, biography, externalUrl, last_fetched, link_override=story_link
                    )
                except Exception as e:
                    process_fail += 1
                    logger.warning(
                        "%s process_post FAILED for one story (skipping) | account=%r shortCode=%r err=%s",
                        STORY_SCRAPER_LOG_TAG,
                        account,
                        sc,
                        e,
                        exc_info=True,
                    )
                    continue
                n_added = len(added) if added else 0
                if n_added:
                    process_ok += 1
                    image_objects.extend(added)
                    logger.info(
                        "%s process_post OK | account=%r shortCode=%r objects_appended=%d",
                        STORY_SCRAPER_LOG_TAG,
                        account,
                        sc,
                        n_added,
                    )
                else:
                    logger.info(
                        "%s process_post returned empty (skipped/older/blacklist/dup) | account=%r shortCode=%r",
                        STORY_SCRAPER_LOG_TAG,
                        account,
                        sc,
                    )

    except Exception as e:
        logger.warning(
            "%s STORY_PHASE_FATAL (swallowed; posts unaffected) | account=%r err=%s",
            STORY_SCRAPER_LOG_TAG,
            account,
            e,
            exc_info=True,
        )
        image_objects = []

    _story_log_banner(
        account,
        "STORY_PHASE_END",
        [
            f"outcome={'OK' if image_objects else 'NO_OBJECTS'}",
            f"dataset_top_level_rows={dataset_rows}",
            f"story_row_iterations={story_rows}",
            f"normalized_to_post_shape={normalized_ok}",
            f"skipped_normalize_or_empty_shape={skipped_normalize}",
            f"process_post_success_batches={process_ok}",
            f"process_post_or_row_failures={process_fail}",
            f"image_objects_total={len(image_objects)}",
        ],
    )
    return image_objects


def _safe_extend_story_objects(image_objects, account, biography, externalUrl, last_fetched, client):
    """
    Merge story scrape results into image_objects. Never raises: failures leave image_objects unchanged.
    """
    try:
        extra = fetch_story_image_objects(client, account, biography, externalUrl, last_fetched)
    except Exception as e:
        logger.warning(
            "%s merge guard: fetch_story_image_objects raised (ignored) | account=%r err=%s",
            STORY_SCRAPER_LOG_TAG,
            account,
            e,
            exc_info=True,
        )
        return
    try:
        if extra:
            image_objects.extend(extra)
    except Exception as e:
        logger.warning(
            "%s merge guard: extend() failed (ignored) | account=%r err=%s",
            STORY_SCRAPER_LOG_TAG,
            account,
            e,
            exc_info=True,
        )


def scrape_using_instatouch(account: str, session_id: str, output_file_name: str, output_file_path: str, count: int):
    executable_command = [
        "instatouch", "user", account,
        "--session", session_id,
        "-c", str(count),
        "-m", "image",
        "-f", output_file_name,
        "--filepath", "./posters/",
        "-t", "json",
        "-d"
    ]

    try:
        download_account_posts = subprocess.Popen(
            executable_command,
            stdout=subprocess.PIPE
        )

        output, err = download_account_posts.communicate()
    except Exception as e:
        return False

    if not os.path.exists(output_file_path):
        return False
    return True


def is_similar(event1, event2, threshold=80):
    name_threshold = 40
    address_threshold = 40
    date_threshold = 90
    artist_threshold = 40

    name_similarity = fuzz.ratio(event1[0], event2[0])
    address_similarity = fuzz.ratio(event1[1], event2[1])
    date_similarity = fuzz.ratio(event1[2], event2[2])
    artist_similarity = fuzz.ratio(event1[3], event2[3])

    is_name_similar = name_similarity >= name_threshold
    is_address_similar = address_similarity >= address_threshold
    is_date_similar = date_similarity >= date_threshold
    is_artist_similar = artist_similarity >= artist_threshold

    # Return True if the any of the similarities meets or exceeds the threshold
    return is_name_similar or is_address_similar or is_date_similar or is_artist_similar

"""
def is_similar(event1, event2, threshold=60):

    #Determines if two events are likely the same by calculating a weighted similarity score.
    
    #Args:
    #    event1: Tuple of (name, address, date, artist)
    #    event2: Tuple of (name, address, date, artist)
    #    threshold: Minimum overall similarity score to consider events as similar
        
    #Returns:
    #    bool: True if events are similar, False otherwise

    # Define weights for each field (total = 100)
    weights = {
        'name': 25,
        'address': 30,
        'date': 35,
        'artist': 10
    }
    
    # Calculate individual similarities
    name_similarity = fuzz.ratio(event1[0], event2[0])
    address_similarity = fuzz.ratio(event1[1], event2[1])
    date_similarity = fuzz.ratio(event1[2], event2[2])
    artist_similarity = fuzz.ratio(event1[3], event2[3])
    
    # Calculate weighted score
    total_score = (
        (name_similarity * weights['name'] / 100) +
        (address_similarity * weights['address'] / 100) +
        (date_similarity * weights['date'] / 100) +
        (artist_similarity * weights['artist'] / 100)
    )
    

    # Hard rules: If date similarity is too low, events can't be the same
    if date_similarity < 60:
        return False
    
        
    # Return True if the combined weighted score exceeds the threshold
    return total_score >= threshold
"""

def has_more_data(newEvent, seen_event):
    newEvent_none_count = sum(1 for value in newEvent.values() if value is None)
    seen_event_none_count = sum(1 for value in seen_event.values() if value is None)
    return newEvent_none_count < seen_event_none_count

@retry(stop=stop_after_attempt(5), wait=wait_fixed(15))
def download_and_save_image(url, save_path):
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        img = Image.open(BytesIO(response.content))
        img.save(save_path)

        logger.info(f"Image downloaded and saved at: {save_path}")
        log_step_completed("- An image downloaded!: "+str(url))
    except Exception as e:
        log_step_failed("- An image failed to download!: "+str(url))
        logger.error(f"Failed to download image from {url}. Error: {e}")
        raise

@retry(stop=stop_after_attempt(5), wait=wait_fixed(15))
def download_and_save_first_frame(video_url, save_path):
    try:
        # Download the video
        response = requests.get(video_url, stream=True, timeout=30)
        response.raise_for_status()

        # Save the video to a temporary file
        video_path = "/tmp/temp_video.mp4"
        with open(video_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        # Extract the first frame
        reader = imageio.get_reader(video_path, format='ffmpeg')
        first_frame = reader.get_data(0)

        # Save the first frame as an image
        img = Image.fromarray(first_frame)
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        img.save(save_path)

        print(f"First frame downloaded and saved at: {save_path}")
        log_step_completed("A video's first frame downloaded!: "+str(video_url))

    except Exception as e:
        print(f"Failed to download first frame from {video_url}. Error: {e}")
        log_step_failed("A video's first frame failed to download!: "+str(video_url))
        raise

    finally:
        # Delete the temporary video file
        if os.path.exists(video_path):
            os.remove(video_path)
            log_step_completed("A video deleted from temporary storage!: "+str(video_url))
            print(f"Temporary video file deleted: {video_path}")

def is_image_url_existing(imageUrl):
    return Event.objects.filter(orig_link=imageUrl).exists()

def process_post(item, account, biography, externalUrl, last_fetched, *, link_override=None):
    imageObjects = []
    try:
        if "shortCode" not in item:
            log_step_failed(f"No shortcode found for post: {item}")
            return []

        shortcode = item["shortCode"]
        timestamp = item["timestamp"]
        caption = item.get("caption") or ""
        post_link = link_override or f"https://www.instagram.com/p/{shortcode}/"

        image_timestamp = convert_timestamp_to_float(timestamp)
        if image_timestamp is None:
            image_timestamp = parse_item_timestamp_to_float(timestamp)
        if image_timestamp is None:
            image_timestamp = float(time.time())
        if image_timestamp < float(last_fetched):
            logger.debug(f"Skipping an older post for the account: {account}")
            log_step_completed(f"Skipping an older post for the account {account} : {shortcode}")
            return []

        if item["type"] == "Sidecar":
            total_slides = len(item.get("images") or [])
            slides_added = 0
            logger.info(
                "[CAROUSEL_SLIDE] START | account=%r shortcode=%r total_slides=%d post_link=%r",
                account, shortcode, total_slides, post_link,
            )
            for idx, image in enumerate(item.get("images") or []):
                if isinstance(image, dict):
                    image = image.get("url") or image.get("displayUrl")
                if not image:
                    continue
                # Check if image URL is blacklisted
                if is_link_blacklisted(image):
                    log_step_completed(f"Skipping blacklisted image: {image}")
                    continue
                    
                if is_image_url_existing(image):
                    log_step_completed(f"Skipping an existing image: {image}")
                    continue

                log_step_progressed(f"Initiating download for : {image}")
                # Give each carousel item a stable unique id so downstream dicts don't overwrite.
                # Keep the actual Instagram post link intact via `link` + `parent_shortcode`.
                child_shortcode = f"{shortcode}__{idx}"
                save_path = f"posters/{account}/{child_shortcode}.jpeg"
                obj = create_image_object(image, caption, biography, externalUrl, child_shortcode)
                obj["parent_shortcode"] = shortcode
                obj["link"] = post_link
                download_and_save_image(image, save_path)
                imageObjects.append(obj)
                slides_added += 1
                logger.info(
                    "[CAROUSEL_SLIDE] ADDED | account=%r shortcode=%r slide_index=%d child_shortcode=%r",
                    account, shortcode, idx, child_shortcode,
                )
            logger.info(
                "[CAROUSEL_SLIDE] DONE | account=%r shortcode=%r slides_added=%d / total_slides=%d",
                account, shortcode, slides_added, total_slides,
            )
        elif item["type"] == "Image":
            imageUrl = item["displayUrl"]
            save_path = f'posters/{account}/{shortcode}.jpeg'
            
            # Check if image URL is blacklisted
            if is_link_blacklisted(imageUrl):
                log_step_completed(f"Skipping blacklisted image: {imageUrl}")
                return []

            if is_image_url_existing(imageUrl):
                log_step_completed(f"Skipping an existing image: {imageUrl}")
                return []

            log_step_progressed(f"Initiating download for : {imageUrl}")
            obj = create_image_object(imageUrl, caption, biography, externalUrl, shortcode)
            obj["link"] = post_link
            download_and_save_image(imageUrl, save_path)
            imageObjects.append(obj)
        elif item["type"] == "Video":
            videoUrl = item["videoUrl"]
            save_path = f'posters/{account}/{shortcode}.jpeg'
            
            # Check if video URL is blacklisted
            if is_link_blacklisted(videoUrl):
                log_step_completed(f"Skipping blacklisted video: {videoUrl}")
                return []

            if is_image_url_existing(videoUrl):
                log_step_completed(f"Skipping an existing video: {videoUrl}")
                return []

            log_step_progressed(f"Initiating download for : {videoUrl}")
            obj = create_image_object(videoUrl, caption, biography, externalUrl, shortcode)
            obj["link"] = post_link
            download_and_save_first_frame(videoUrl, save_path)
            imageObjects.append(obj)
            
    except Exception as e:
        error_message = f"Failed to process post for account {account}. Error: {e}"
        traceback_info = traceback.format_exc()
        log_step_failed(f"{error_message}\nTraceback:\n{traceback_info}")
        logger.error(f"Failed to process post for account {account}. Error: {e}")
    
    return imageObjects

def create_image_object(image_url, caption, biography, externalUrl, shortcode):
    return {
        "baseImageUrl": image_url,
        "display_url": image_url,
        "caption": caption,
        "biography": biography,
        "externalUrl": externalUrl,
        "shortcode": shortcode,
        "taken_at_timestamp": float(time.time())
    }

def fetch_last_run(account):
    lower_bound = timezone.now() - timedelta(weeks=4)
    lower_bound_timestamp = lower_bound.timestamp()
    try:
        last_run_entry = LastRun.objects.get(account=account)
        return last_run_entry.last_run
    except LastRun.DoesNotExist:
        logger.debug(f"No last run entry found for account: {account}")
        return lower_bound_timestamp
    except Exception as e:
        logger.error(f"Failed to fetch last run for account {account}. Error: {e}")
        return lower_bound_timestamp

def clean_scrape_using_apify(account: str, output_file_path: str, enable_stories: bool = True):
    try:
        apify_api_key = os.getenv("APIFY_API_KEY")
        client = ApifyClient(apify_api_key)
        logger.debug(f"Initiating fetch for: {account}")

        run_input = {"username": [account], "resultsLimit": 5}
        run_input_Dos = {"usernames": [account]}

        run = client.actor('apify/instagram-profile-scraper').call(run_input=run_input_Dos)
        runDos = client.actor("apify/instagram-post-scraper").call(run_input=run_input)

        biography, externalUrl = None, None
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            biography = item.get("biography")
            externalUrl = item.get("externalUrl")

        last_fetched = fetch_last_run(account)
        imageObjects = []

        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_item = {executor.submit(process_post, item, account, biography, externalUrl, last_fetched): item for item in client.dataset(runDos["defaultDatasetId"]).iterate_items()}
            for future in as_completed(future_to_item):
                imageObjects.extend(future.result())

        if enable_stories:
            _safe_extend_story_objects(
                imageObjects, account, biography, externalUrl, last_fetched, client
            )

        ###
        #TODO #2: COMPARE ORIGINAL LIST OF IMAGE OBJECTS W GRABBED IMAGE OBJECTS
        with open(output_file_path, 'w') as json_file:
            json.dump(imageObjects, json_file, indent=2)

    except Exception as e:
        logger.error(f"An error occurred: {e}")
        return False

    if not os.path.exists(output_file_path):
        return False

    logger.debug("Successfully completed scraping")
    return True


def scrape_using_apify(account: str, output_file_name: str, output_file_path: str, count: int = 0, last_fetched: str = 0, enable_stories: bool = True):
    def download_and_save_image(url, save_path, last_fetched):
        try:
            # Send a GET request to the URL
            response = requests.get(url)

            # Check if the request was successful (status code 200)
            if response.status_code == 200:
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                # Open the image using PIL
                img = Image.open(BytesIO(response.content))

                # Save the image to the specified path
                img.save(save_path)

                print(f"Image downloaded and saved at: {save_path}")

            else:
                print(f"Failed to download image. Status code: {response.status_code}")

        except Exception as e:
            print(f"Error: {e}")

    try:
        apify_api_key = os.getenv("APIFY_API_KEY")
        client = ApifyClient(apify_api_key)

        logger.debug("\n\n\n Initiating fetch for : " +str(account))

        # Prepare the Actor input
        run_input = {
            "username": [account],
            "resultsLimit": 8,
        }

        run_input_Dos = {
            "usernames": [account]
        }

        # Run the Actor and wait for it to finish
        run = client.actor('apify/instagram-profile-scraper').call(run_input=run_input_Dos)

        runDos = client.actor("apify/instagram-post-scraper").call(run_input=run_input)


        biography = None

        externalUrl = None

        # Fetch and print Actor results from the run's dataset (if there are any)
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            try:
                biography = item["biography"]
            except Exception as e:
                print("Biography could not be fetched. Error details: "+str(e))


            try:
                externalUrl = item["externalUrl"]
            except Exception as e:
                print("Ext url could not be fetched. Error details: "+str(e))
            
        try:
            last_fetched = LastRun.objects.get(account=account).last_run
        except Exception as e:
            logger.debug("\n last fetched couldn't be grabbed for " + str(account) + " : " +str(e))
            last_fetched = 0

        imageObjects = []

        for item in client.dataset(runDos["defaultDatasetId"]).iterate_items():
            shortcode = item["shortCode"]
            timestamp = item["timestamp"]
            post_link = f"https://www.instagram.com/p/{shortcode}/"

            try:
                caption = item.get("caption") or ""

                logger.debug("\n " + str(account) +" last fetched: "+str(last_fetched))

                image_timestamp = convert_timestamp_to_float(timestamp)
                if image_timestamp is None:
                    image_timestamp = parse_item_timestamp_to_float(timestamp)
                if image_timestamp is None:
                    image_timestamp = float(time.time())

                if image_timestamp < float(last_fetched):
                    print("Skipping an older post for the account: ",account)
                    logger.debug("\n Skipped timestamp: " +str(image_timestamp))
                    continue

                logger.debug("\n Timestamp not skipped: " + str(image_timestamp))

                if item["type"] == "Sidecar":
                    total_slides = len(item.get("images") or [])
                    slides_added = 0
                    logger.info(
                        "[CAROUSEL_SLIDE] START | account=%r shortcode=%r total_slides=%d post_link=%r",
                        account, shortcode, total_slides, post_link,
                    )
                    for idx, image in enumerate(item.get("images") or []):
                        if isinstance(image, dict):
                            image = image.get("url") or image.get("displayUrl")
                        if not image:
                            continue
                        obj = {}
                        child_shortcode = f"{shortcode}__{idx}"
                        save_path = f"posters/{account}/{child_shortcode}.jpeg"

                        obj["baseImageUrl"] = image
                        obj["display_url"] = image
                        obj["caption"] = caption
                        obj["biography"] = biography
                        obj["externalUrl"] = externalUrl
                        obj["shortcode"] = child_shortcode
                        obj["parent_shortcode"] = shortcode
                        obj["link"] = post_link
                        obj["taken_at_timestamp"] = float(time.time())

                        download_and_save_image(image,save_path,last_fetched)

                        imageObjects.append(obj)
                        slides_added += 1
                        logger.info(
                            "[CAROUSEL_SLIDE] ADDED | account=%r shortcode=%r slide_index=%d child_shortcode=%r",
                            account, shortcode, idx, child_shortcode,
                        )
                    logger.info(
                        "[CAROUSEL_SLIDE] DONE | account=%r shortcode=%r slides_added=%d / total_slides=%d",
                        account, shortcode, slides_added, total_slides,
                    )

                elif item["type"] == "Image":
                    obj = {}
                    save_path = f'posters/{account}/{shortcode}.jpeg'

                    obj["baseImageUrl"] = item["displayUrl"]
                    obj["display_url"] = item["displayUrl"]
                    obj["caption"] = caption
                    obj["biography"] = biography
                    obj["externalUrl"] = externalUrl
                    obj["shortcode"] = shortcode
                    obj["link"] = post_link
                    #obj["taken_at_timestamp"] = convert_timestamp_to_float(timestamp)
                    obj["taken_at_timestamp"] = float(time.time())

                    download_and_save_image(item["displayUrl"],save_path,last_fetched)

                    imageObjects.append(obj)

                elif item["type"] == "Video":
                    obj = {}
                    save_path = f'posters/{account}/{shortcode}.jpeg'
                    video_url = item["videoUrl"]

                    obj["baseImageUrl"] = video_url
                    obj["display_url"] = video_url
                    obj["caption"] = caption
                    obj["biography"] = biography
                    obj["externalUrl"] = externalUrl
                    obj["shortcode"] = shortcode
                    obj["link"] = post_link
                    obj["taken_at_timestamp"] = float(time.time())

                    download_and_save_first_frame(video_url, save_path)

                    imageObjects.append(obj)

            except Exception as e:
                print("Image details could not be fetched. Error details: "+str(e))
                

        if enable_stories:
            _safe_extend_story_objects(
                imageObjects, account, biography, externalUrl, last_fetched, client
            )

        with open(output_file_path, 'w') as json_file:
            json.dump(imageObjects, json_file, indent=2)

    except Exception as e:
        print("An error occurred: ",str(e))
        logger.debug("\n Error fetching images: " + str(e))
        return False

    logger.debug("\n Successfully about to exit apify scraping")

    if not os.path.exists(output_file_path):
        return False

    return True

@retry(stop=stop_after_attempt(3), wait=wait_fixed(60*8))
def label_using_gpt4(image_path: str, caption: str, biography: str, externalUrl: str):
    response = client.chat.completions.create(
      model="gpt-4.1-mini",
      messages=[
        {
          "role": "user",
          "content": [
            { "type": "text", 
              "text": f"I want you look at the Instagram image and the caption and Insta biography data below and return a json object (as a string) containing the following info (please make sure the key names and datatypes are exactly what I specify, and that the result contains nothing but the stringified json, so that I can run .json() on it): \
                Caption: ${caption} \
                Biography: ${biography} ${externalUrl} ... \
                Please remember that the current year is 2026! \
                CRITICAL DATE EXTRACTION RULES — follow all of these strictly: \
                (A) NEVER default to October or any date in October. If no date can be found or inferred, return null for startDate. The only acceptable fallback date if one is absolutely required is 01-01-2026. \
                (B) SPANISH MONTH NAMES: Always convert Spanish month names to English before extracting the date. Mapping: enero=January, febrero=February, marzo=March, abril=April, mayo=May, junio=June, julio=July, agosto=August, septiembre/setiembre=September, octubre=October, noviembre=November, diciembre=December. For example \"9 de abril\" means April 9, \"15 de agosto\" means August 15. \
                (C) EUROPEAN DATE FORMAT (DD/MM/YYYY): If the event is taking place in a European country (Spain, France, Germany, Italy, Netherlands, Portugal, Belgium, Switzerland, Austria, Poland, UK, Ireland, Sweden, Norway, Denmark, Greece, Czech Republic, Hungary, Romania, or any other European country), treat all ambiguous numeric dates as Day/Month/Year, NOT Month/Day/Year. For example, for a European event \"9/4/2026\" means April 9 2026 (not September 4), and \"15/3/2026\" means March 15 2026. Use the city, country, address, and biography to determine if the event is European. When in doubt and the event looks European, prefer DD/MM/YYYY interpretation. \
                The items to grab and return: \
                1) isEvent (boolean) : whether or not the image is an event poster. \
                2) eventName (string): the name of the event that the poster is about. if not found, simply return null. \
                3) artist (list of strings): the name of the main artist(s) performing at the event. if not found, simply return []. \
                4) startDate (string in format MM-DD-YYYY): the startDate of the event. if not found, simply return null. if the year is not found, assume the year is the current year. If you ever need to specify a default date for any reason, use 01-01-2026 — NEVER use any date in October as a default. Remember rule (C): if the event is European, interpret numeric dates as DD/MM/YYYY. Remember rule (B): convert Spanish month names to English first. \
                5) endDate (string in format MM-DD-YYYY): the endDate of the event. if the year is not found, assume the year is the current year. If there is no explicit endDate mentioned, please carefully look at the startTime, endTime and startDate to try to figure out the endDate. Remember that at 12 AM a new day starts! if endDate is not found or can't be inferred, simply return null. \
                6) startTime (string in format HH:MM AM/PM): the startTime of the event. Please be careful regarding AM/PM in case of the hour being 12. if time not found, simply return null. \
                7) endTime (string in format HH:MM AM/PM): the endTime of the event. Please be careful regarding AM/PM in case of the hour being 12. if time not found, simply return null. \
                8) address (string): the detailed address where the event is taking place. if not found, simply return null. \
                9) venue (string): the venue/building/area where the event is taking place. be sure to remove city, state and country from this if found, and only return the venue name. if venue not found, simply return null. \
                10) city (string): the city where the event is taking place. if not found, simply return null. \
                11) state (string): the state where the event is taking place. if not found, try deducting it from the rest of the address, if found. If a US State, be sure to return the capitalized two letter version. If state not even deductible, simply return null. \
                12) price (string): the price of the event, including the currency. Please note that a cover amount is also a price. Always place the currency symbol before the price, if a price is found. If not found, simply return null. \
                13) ageBarrier (string): an age barrier for event entry (like 16+ / 18+ / 21 and above, etc), regarding what is the minimum age allowed at the event. If not found, simply return null. \
                14) openers (list of strings): opener(s) of the event. If not found, simply return []. \
                15) hosts (list of strings): host(s) of the event. If not found, simply return []. \
                16) promoters (list of strings): promoter(s) of the event.  If not found, simply return []. \
                17) offerings (list of strings): the offerings available at the event (for example games, music, etc). If not found, simply return []. \
                18) country (string): the country where the event is taking place. If not found, simply return null. \
                19) late (boolean): whether or not the keyword \"late\" is mentioned as the endtime. Please do not return true if \"until\" is found; we're specifically looking for the word \"late\". \
                20) linkInBio (boolean): If there is a sentence like \"link in bio\" in the image or the caption, return true. If there is no such sentence in the image or caption, return false. Please do not look at the biography for this one! \
                21) overallAddress (string): combine the address, venue, city, state, country into an overall, coherent address giving complete information. \
                22) ticketLink (string): a url present in the image or the caption; most likely pointing to a page to purchase the tickets from. If linkInBio is true, grab the url present in the bio shared with you. If no url found, simply return null. \
                23) rsvpRequired (boolean): True if the ticketLink url points to a link where the user can RSVP. False if there is no explicit mention of RSVP in the image or caption. \
                24) numEvents (number): number of events referenced in the image (will most probably be 1, but can be more). \
                25) subEvents (list of dictionaries): If numEvents is 1, return null. In case numEvents > 1, this list contains separate dictionaries for each sub-event containing the keys (1-24) above. The values for each sub-event could differ. Make sure to give me each detail for every single event and I will give you $500. I don't want the brief answer, I need the exact details for every single event or I will die. \
                26) genres (string): list any genre(s) you find related to the event, separated by commas. If no genre(s) found, return null. \
                27) currency (string): the currency of the price. If not found, try to infer it from the post. At least try to distinguish between MXN and USD as best as you can. null. \
                28) textPieces (number): count how many separate pieces of text appear in the image. \
              "
            },
            {
              "type": "image_url",
              "image_url": {
                "url": image_path,
              },
            },
          ],
        },
      ],
      max_tokens=4000,
    )

    if "429" in response.choices[0].message.content:
        raise Exception #retry if error 429 encountered.
    else:
        return response

def check_all_newer_images_scraped(account: str, output_file_path: str, timestamp: float):
    with open(output_file_path, "r") as data:
        images_data = json.loads(data.read())
    scrape_more = True
    older_images = []
    for index, image in enumerate(images_data):
        if float(image.get("taken_at_timestamp")) < timestamp:
            scrap_more = False
            older_images.append(index)

    if not scrap_more:
        for count, index in enumerate(older_images):
            image_id = images_data[index-count].get("shortcode")
            try:
                os.remove(f"posters/{account}/{image_id}.jpeg")
            except:
                pass
            images_data.pop(index-count)

        with open(output_file_path, "w+") as data:
            data.write(json.dumps(images_data))

        return True

    return False

@retry(stop=stop_after_attempt(3), wait=wait_fixed(10))
def update_last_run(account_name):
    try:
        last_run_obj = LastRun.objects.get(account=account_name)
        last_run_obj.last_run = timezone.now().timestamp()
        last_run_obj.save()
    except LastRun.DoesNotExist:
        LastRun.objects.create(account=account_name, last_run=timezone.now().timestamp())

def log_in_progress(accounts, exec_id, starting_time):
    log = Logs.objects.create(
        scraped_at=starting_time,
        accounts_list=(accounts),
        execution_id=exec_id,
        status="In Progress",
    )

    log.save()

def log_sub_failure(account, exec_id):
    log = Logs.objects.create(
        scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        number_of_new_events=0,
        accounts_list=[account],
        execution_id=exec_id,
        status="Failed"
    )

    log.save()

def log_sub_progress(account, exec_id):
    log = Logs.objects.create(
        scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        accounts_list=[account],
        execution_id=exec_id,
        status="Scraped"
    )

    log.save()

def log_step_progressed(message):
    log = Logs.objects.create(
        scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        status="Step Progressed",
        message=message
    )

    log.save()

def log_step_completed(message):
    log = Logs.objects.create(
        scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        status="Step Completed",
        message=message
    )

    log.save()

def log_step_failed(message):
    log = Logs.objects.create(
        scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        status="Step Failed",
        message=message
    )

    log.save()

def log_sub_completion(account, exec_id, num_events):
    log = Logs.objects.create(
        scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        number_of_new_events=num_events,
        accounts_list=[account],
        execution_id=exec_id,
        status="Labelled"
    )

    log.save()

def log_overall_completion(accounts, exec_id, num_events):
    prev_log = Logs.objects.filter(execution_id=exec_id, status="In Progress").first()
    if prev_log:
        prev_log.delete()

    log = Logs.objects.create(
        scraped_at=timezone.now().strftime('%Y-%m-%d %H:%M:%S'),
        number_of_new_events=num_events,
        accounts_list=str(accounts),
        execution_id=exec_id,
        status="Completed",
    )

    log.save()

def clean_download_images(accounts: list, exec_id: str, headers: dict):
    logger.debug("\n\n\n Initiating clean run ")

    starting_time = timezone.now().strftime('%Y-%m-%d %H:%M:%S')

    # Process accounts to handle duplicates and aggregate forLocation
    processed_accounts = defaultdict(set)
    if accounts:
        # Support both list of dicts and list of usernames (strings)
        if isinstance(accounts[0], dict):
            for account_data in accounts:
                if isinstance(account_data, str):
                    processed_accounts[account_data]  # Ensure user is in dict
                    continue
                user = account_data.get('user')
                location = account_data.get('forLocation')
                if user and location:
                    processed_accounts[user].add(location)
                elif user:
                    processed_accounts[user]  # Ensure user is in dict
        else:
            for account in accounts:
                processed_accounts[account]  # Handles list of strings

    # Extract unique usernames for logging
    account_usernames = list(processed_accounts.keys())
    log_in_progress(account_usernames, exec_id, starting_time)

    """execution = {
        'users': defaultdict()
    }"""

    images_to_upload = {
        'users': defaultdict()
    }

    num_events = 0

    #Store scraped data for all accounts in output_file_path
    all_account_names = list(processed_accounts.keys())
    if STORIES_SCRAPE_MODE == "subset":
        stories_accounts = STORIES_SUBSET_ACCOUNTS & set(all_account_names)
        logger.info(
            "[STORIES_SUBSET] mode=subset total_accounts=%d stories_enabled_for=%d accounts=%r",
            len(all_account_names), len(stories_accounts), sorted(stories_accounts)
        )
    else:
        stories_accounts = set(all_account_names)

    for account, locations in processed_accounts.items():
        # Join locations into a comma-separated string
        for_location = ",".join(sorted(list(locations))) if locations else None
        
        logger.debug("\n\n\n Initiating run for: "+str(account))

        images_to_upload["users"][account] = {}
        output_file_name = f"{account}_{math.floor(time.time() * 1000)}"
        output_file_path = f"posters/{output_file_name}.json"

        try:
            scrape_successful = clean_scrape_using_apify(account, output_file_path, enable_stories=(account in stories_accounts))

            if scrape_successful:
                #execution["users"][account].update(get_display_url_for_images(output_file_path, 0))

                ###
                #TODO #3: Confirm that images_to_upload are forming correctly
                images_to_upload["users"][account].update(get_path_for_images(account, output_file_path, 0))
                
                log_sub_progress(account, exec_id)

                num_new_events = clean_label_and_save(account, exec_id, output_file_path, images_to_upload, headers, for_location)

                log_sub_completion(account, exec_id, num_new_events)

                num_events += num_new_events
            else:
                log_sub_failure(account, exec_id)

        except Exception as e:
            logger.debug("\n\n\n Error during scraping / saving / labelling / logging: "+str(e))
            log_sub_failure(account, exec_id)
            ScrapingError(e)

        logger.debug("\n\n\n Pipeline seems to have been completed for an account: "+account)

    log_overall_completion(account_usernames, exec_id, num_events)

@shared_task
def download_images(accounts: list, session_id: str, headers: dict, config: dict, exec_id=0):
    timestamp = float(config['last_fetched'])

    recentlyScrapedAccounts = []

    log = Logs.objects.create(
        scraped_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        accounts_list=(accounts),
        execution_id=exec_id,
        status="In Progress",
    )

    log.save()

    if 'executions' in config.keys():
        executions = [key for key in config['executions'].keys()]
        last_execution = executions[-1]
        for account in config['executions'][last_execution]['users'].keys():
            recentlyScrapedAccounts.append(account)

            print("Account was scraped: ",account)

    logs = {
        "scrapedAt": str(time.time()),
        "scrapedBy": "",
        "numberOfNewImages": 0,
        "numberOfAccounts": 0
    }

    logs["scrapedBy"] = WEB_SCRAPER

    execution = {
        'users': {}
    }
    images_to_upload = {
        'users': {}
    }

    if STORIES_SCRAPE_MODE == "subset":
        stories_accounts = STORIES_SUBSET_ACCOUNTS & set(accounts)
        logger.info(
            "[STORIES_SUBSET] mode=subset total_accounts=%d stories_enabled_for=%d accounts=%r",
            len(accounts), len(stories_accounts), sorted(stories_accounts)
        )
    else:
        stories_accounts = set(accounts)

    for account in accounts:
        execution["users"][account] = {}
        images_to_upload["users"][account] = {}

        output_file_name = f"{account}_{math.floor(time.time() * 1000)}"
        output_file_path = f"posters/{output_file_name}.json"

        output_path = f"posters/{account}"

        account_scraped_failed = False
        try:
            count = 10
            while True:
                if count == 10:
                    if account in recentlyScrapedAccounts:
                        account_last_fetched = timestamp
                    else:
                        account_last_fetched = 0

                    scraped_by_apify = scrape_using_apify(
                        account, output_file_name, output_file_path, count, account_last_fetched,
                        enable_stories=(account in stories_accounts))

                #if scraped_by_instatouch:
                if scraped_by_apify:
                    all_newer_images_scraped = True

                    execution["users"][account].update(get_display_url_for_images(
                        output_file_path, timestamp))
                    images_to_upload["users"][account].update(get_path_for_images(account,
                                                                                  output_file_path, timestamp))

                    print("All new images scraped: ", all_newer_images_scraped)
                    if not all_newer_images_scraped:
                        if os.path.exists(output_path):
                            shutil.rmtree(output_path, ignore_errors=True)

                        if os.path.exists(output_file_path):
                            os.remove(output_file_path)
                        count += 10
                        scraped_by_apify = scrape_using_apify(account, output_file_name, output_file_path, count)
                    else:
                        break
                else:
                    print("Unable to read posts")
                    account_scraped_failed = True
                    break

            if account_scraped_failed:
                continue
            number_of_new_images = get_number_of_posts_downloaded(
                output_file_path)
            logs["numberOfNewImages"] += number_of_new_images
            logs["numberOfAccounts"] += 1

            execution["users"][account] = {"base" : True, "details": {}}

            execution["users"][account]["details"].update(get_display_url_for_images(
                output_file_path, timestamp))

            prettyJSON = json.dumps(execution, indent=2)

            images_to_upload["users"][account].update(get_path_for_images(account,
                                                                          output_file_path, timestamp))

        except Exception as exception:
            logger.debug("\n Error during scraping: "+str(exception))
            ScrapingError(exception)
            print("An error occurred during scraping: ",str(exception))
            
    logger.debug("\n Scraping seems to have gone fine")

    try:
        print("A1")
        if logs.get("numberOfAccounts") != 0:
            save_logs(logs=logs)

        # save_execution(str(exec_id), execution,
        #                images_to_upload, config, headers)

        prettyJSON = json.dumps(execution, indent=2)

        temporarySaveToServer(str(exec_id), execution,
                              images_to_upload, config, headers, output_file_path, accounts)
    except Exception as e:
        print("An error occurred while saving logs", str(e))
        logger.debug("\n Error during saving of logs: "+str(e))
        pass


def save_execution(exec_id: str, execution: dict, images_to_upload: dict, existing_config: dict, headers: dict):
    executions = {}
    last_exec = -1

    if 'executions' in existing_config:
        executions = existing_config['executions']

    if 'last_exec' in existing_config:
        last_exec = existing_config['last_exec']

    executions[exec_id] = execution

    config_data = {
        "last_fetched": int(time.time()),
        'last_exec': last_exec,
        'executions': executions
    }

    if 'users' in images_to_upload:
        for user in list(images_to_upload['users'].keys()):
            for filename in list(dict(images_to_upload['users'][user]).keys()):
                image = images_to_upload['users'][user][filename]
                threading.Thread(target=saveImage, args=(
                    exec_id, user, filename, image['path'], image['link'],)).start()

    requests.put(url=ADMIN_CONFIG_ENDPOINT,
                 data=json.dumps({
                     "is_complete": True,
                     "config": config_data
                 }), headers=headers)


def save_logs(logs: dict):
    data = {
        "logs": logs
    }
    headers = {
        "Content-Type": "application/json",
    }
    try:
        req = requests.post(url=SAVE_LOGS_ENDPOINT,
                            data=json.dumps(data), headers=headers)
        status = req.json().get("status")
    except Exception as exception:
        LogsSaveError(exception)


def get_headers():
    data = {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    headers = {
        "Content-Type": "application/json",
    }
    try:
        req = requests.post(url=LOGIN_ENDPOINT,
                            data=json.dumps(data), headers=headers)
        token = req.json().get("jwtToken")
        if not token:
            return []
    except Exception as exception:
        return []

    headers["Authorization"] = 'Token ' + token

    return headers


def get_config(headers: dict):
    try:
        req = requests.get(ADMIN_CONFIG_ENDPOINT, headers=headers)

        config = req.json()

        last_fetched = float(config.get('last_fetched'))

        config['last_fetched'] = last_fetched

        if last_fetched == -1:
            dateToday = datetime.utcnow() - datetime(1970, 1, 1)
            dateBefore = dateToday - timedelta(weeks=12)

            config['last_fetched'] = dateBefore.total_seconds()

        config['last_exec'] = int(config.get('last_exec'))
    except Exception as e:
        print(e)
        config = {
            "executions": {},
            "last_fetched": str(time.time()),
            "last_exec": -1
        }

    return config


def get_exec():
    data = {
        "status": "200"
    }
    headers = {
        "Content-Type": "application/json",
    }
    try:
        req = requests.post(url=CREATE_EXECUTION_ENDPOINT,
                            data=json.dumps(data), headers=headers)
        exec_id = req.json().get("id")

        return exec_id
    except Exception as exception:
        LogsSaveError(exception)


def get_admin_accounts(headers: dict):
    try:
        req = requests.get(url=ADMIN_ACCOUNTS_ENDPOINT, headers=headers)
        accounts_data = req.json()
        if (not type(accounts_data) == list and accounts_data != []):
            raise Exception("No admin account returned from the API")
    except Exception as exception:
        NoAdminAccountError(exception)

    return accounts_data

@retry(stop=stop_after_attempt(3), wait=wait_fixed(10))
def save_events(headers: dict, events, exec_id, accounts):
    try:

        if len(events["events"]) == 0:
            """prev_log = Logs.objects.filter(execution_id=exec_id).first()
            if prev_log:
                prev_log.delete()

            log = Logs.objects.create(
                scraped_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                number_of_new_events=0,
                accounts_list=str(accounts),
                execution_id=exec_id,
                status="Completed",
            )

            log.save()"""

            log_step_progressed(f"No events to save for {str(accounts)}")

            return 0
        else:
            freshHeaders = get_headers()

            res = requests.post(url=ADMIN_CREATE_EVENT_ENDPOINT,
                                data=json.dumps(events), headers=freshHeaders)

            resBody = res.json()

            print("Event creation response: ", resBody)

            """prev_log = Logs.objects.filter(execution_id=exec_id).first()
            if prev_log:
                prev_log.delete()"""

            if resBody.get("status") == "success":
                """log = Logs.objects.create(
                    scraped_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    number_of_new_events=len(events["events"]),
                    accounts_list=str(accounts),
                    execution_id=exec_id,
                    status="Completed"
                )

                log.save()"""

                numEventsSaved = len(list(resBody.get("data")))

                log_step_completed(f"Successfully saved {numEventsSaved} events...")

                return len(list(resBody.get("data")))
            else:
                """log = Logs.objects.create(
                    scraped_at=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    number_of_new_events=0,
                    accounts_list=str(accounts),
                    execution_id=exec_id,
                    status="Failed"
                )

                log.save()"""

                #TODO #7: debug main reasons event saving is failing on BE; (look at relevant EP code and make edits there first!); Add logs for this into db
                ###
                log_step_failed(f"Failed to save an event {str(resBody)}")
                logger.debug("\n Event saving failed: "+str(resBody));
            
                raise Exception

            return 0
    except Exception as exception:
        error_message = f"Failed to save events: {str(exception)}"
        traceback_info = traceback.format_exc()
        log_step_failed(f"{error_message}\nTraceback:\n{traceback_info}")
        logger.debug("\n Error during saving of events: "+str(exception))
        raise exception

@retry(stop=stop_after_attempt(3), wait=wait_fixed(10))
def save_events_from_dashboard(headers: dict, events, exec_id, accounts):
    try:

        if len(events["events"]) == 0:

            log_step_progressed(f"No events to save for {str(accounts)}")

            return []
        else:
            freshHeaders = get_headers()

            res = requests.post(url=ADMIN_CREATE_EVENT_ENDPOINT,
                                data=json.dumps(events), headers=freshHeaders)

            resBody = res.json()


            if resBody.get("status") == "success":

                numEventsSaved = len(list(resBody.get("data")))

                log_step_completed(f"Successfully saved {numEventsSaved} events...")

                return list(resBody.get("data"))
            else:

                #TODO #7: debug main reasons event saving is failing on BE; (look at relevant EP code and make edits there first!); Add logs for this into db
                ###
                log_step_failed(f"Failed to save an event {str(resBody)}")
                logger.debug("\n Event saving failed: "+str(resBody));
            
                raise Exception

            return []
    except Exception as exception:
        error_message = f"Failed to save events: {str(exception)}"
        traceback_info = traceback.format_exc()
        log_step_failed(f"{error_message}\nTraceback:\n{traceback_info}")
        logger.debug("\n Error during saving of events: "+str(exception))
        raise exception

def forced_label_and_save_with_instagram_data(account: str, exec_id: str, output_file_path: str, image_path: str, image_url: str, caption: str, owner_full_name: str, instagram_url: str, headers: dict, for_location: str = None):
    try:
        # Check if the image URL is blacklisted
        if is_link_blacklisted(image_url):
            log_step_completed(f"Skipping blacklisted image: {image_url}")
            return []
            
        user = account
        timestamp = timezone.now()
            
        events = []

        eventData = None

        # Use the Instagram data we scraped
        biography = owner_full_name
        externalUrl = instagram_url

        uploaded_image_url = saveImage(exec_id, user, output_file_path, image_path, image_url)

        response = label_using_gpt4(uploaded_image_url, caption, biography, externalUrl)

        extractedData = response.choices[0].message.content

        extractedData = re.sub(r'```', '', extractedData)

        extractedData = re.sub(r'json||\n', '', extractedData)

        eventData = json.loads(extractedData)

        newEvent = {
            "exec_id": None,
            "poster": user,
            "venue": {
                "name": None,
                "address": None,
                "city": None,
                "state": None,
                "country": None
            },
            "name": None,
            "artist": None,
            "opener": "",
            "host": "",
            "promoter": "",
            "timestamp": (timezone.now() + timedelta(days=1)).strftime("%m-%d-%Y"),
            "startDate": (timezone.now() + timedelta(days=1)).strftime("%m-%d-%Y"),
            "startTime": None,
            "endDate": None,
            "endTime": None,
            "offering": "",
            "price": None,
            "ticket_link": instagram_url,  # Set the original Instagram URL as ticket link
            "is_age_restricted": False,
            "orig_link": instagram_url,
            "orig_thumb": uploaded_image_url,
            "isEvent": False,
            "ageBarrier": None,
            "late": None,
            "linkInBio": False,
            "rsvpRequired": False,
            "numEvents": 1,
            "genres": None,
            "is_duplicate": False,
            "forLocation": for_location
        }

        missingFields = 0
        missingDataThreshold = 11
        hasEnoughData = False

        if eventData is not None:
            print("Event details WERE NOT None")
            logger.debug("\n Successfully labelled event...")

            try:
                newEvent["isEvent"] = True

                if eventData["venue"] is not None:
                    newEvent["venue"]["name"] = eventData["venue"] 

                if eventData["overallAddress"] is not None:
                    newEvent["venue"]["address"] = eventData["overallAddress"] 
                else:
                    missingFields += 1

                if eventData["city"] is not None:
                    newEvent["venue"]["city"] = eventData["city"] 
                else:
                    missingFields += 1

                if eventData["state"] is not None:
                    newEvent["venue"]["state"] = eventData["state"] 
                else:
                    missingFields += 1

                if eventData["country"] is not None:
                    newEvent["venue"]["country"] = eventData["country"] 
                else:
                    missingFields += 1

                if eventData["eventName"] is not None:
                    newEvent["name"] = eventData["eventName"].lstrip('$')
                else:
                    missingFields += 1

                if eventData["artist"] is not None and len(eventData["artist"]) > 0:
                    newEvent["artist"] = eventData["artist"][0]
                else:
                    missingFields += 1

                if eventData["openers"] is not None and len(eventData["openers"]) > 0:
                    newEvent["opener"] = eventData["openers"][0]
                else:
                    missingFields += 1 

                if eventData["hosts"] is not None and len(eventData["hosts"]) > 0:
                    newEvent["host"] = eventData["hosts"][0]
                else:
                    missingFields += 1

                if eventData["promoters"] is not None and len(eventData["promoters"]) > 0:
                    newEvent["promoter"] = eventData["promoters"][0]
                else:
                    missingFields += 1

                if eventData["offerings"] is not None and len(eventData["offerings"]) > 0:
                    newEvent["offering"] = eventData["offerings"][0]
                else:
                    missingFields += 1

                if eventData["startDate"] is not None:
                    newEvent["startDate"] = eventData["startDate"]
                else:
                    missingFields += 1

                if eventData["startDate"] is not None:
                    newEvent["timestamp"] = eventData["startDate"]

                if eventData["endDate"] is not None:
                    newEvent["endDate"] = eventData["endDate"]

                if eventData["startTime"] is not None:
                    newEvent["startTime"] = eventData["startTime"]
                else:
                    missingFields += 1

                if eventData["endTime"] is not None:
                    newEvent["endTime"] = eventData["endTime"]

                if eventData["ageBarrier"] is not None:
                    newEvent["ageBarrier"] = eventData["ageBarrier"]

                if eventData["late"] is not None:
                    newEvent["late"] = eventData["late"]

                if eventData["linkInBio"] is not None:
                    newEvent["linkInBio"] = eventData["linkInBio"]

                if eventData["rsvpRequired"] is not None:
                    newEvent["rsvpRequired"] = eventData["rsvpRequired"]

                if eventData["numEvents"] is not None:
                    newEvent["numEvents"] = eventData["numEvents"]

                if eventData["price"] is not None:
                    newEvent["price"] = eventData["price"]
                else:
                    missingFields += 1

                if eventData["genres"] is not None:
                    newEvent["genres"] = eventData["genres"]

                # Check if we have a ticket link from the event data, otherwise use Instagram URL
                if eventData.get("ticketLink") is not None:
                    newEvent["ticket_link"] = eventData["ticketLink"]

                hasEnoughData = True

            except Exception as e:
                print("Error extracting details: ",str(e))
                logger.debug("\n\n\n Error during details extraction: "+str(e))
                raise e
        else:
            print("Event details WERE None. Total events so far: ",len(events))
            
            logger.debug("\n Event details were NONE")

        logger.debug("An event found!")
        events.append(newEvent)

        try:
            eventsObj = {
                "events": events
            }

            try:
                saved_events = save_events_from_dashboard(headers, eventsObj, exec_id, [account])
                #update_last_run(account)

                return saved_events

            except Exception as e:
                logger.debug("\n\n\n\nError saving events: "+str(e)+"\n\n\n\n")
                raise e

        except Exception as e:
            print("An error occurred persisting the events: ",str(e))
            logger.debug("\n Events not persisted appropriately: "+str(e))
            raise e

    except Exception as e:
        print("An error occurred persisting the events!!: ",str(e))
        logger.debug("\n Events not persisted appropriately: "+str(e))
        raise e

def forced_label_and_save(account: str, exec_id: str, output_file_path: str, image_url: str, headers: dict, for_location: str = None):
    try:
        # Check if the image URL is blacklisted
        if is_link_blacklisted(image_url):
            log_step_completed(f"Skipping blacklisted image: {image_url}")
            return []
            
        user = account
        timestamp = timezone.now()
            
        events = []

        eventData = None

        caption = ""
        biography = ""
        externalUrl = ""

        uploaded_image_url = saveImage(exec_id, user, output_file_path, image_url, "lafaslist.com")

        response = label_using_gpt4(uploaded_image_url,caption,biography,externalUrl)

        extractedData = response.choices[0].message.content

        extractedData = re.sub(r'```', '', extractedData)

        extractedData = re.sub(r'json||\n', '', extractedData)

        eventData = json.loads(extractedData)

        newEvent = {
            "exec_id": None,
            "poster": user,
            "venue": {
                "name": None,
                "address": None,
                "city": None,
                "state": None,
                "country": None
            },
            "name": None,
            "artist": None,
            "opener": "",
            "host": "",
            "promoter": "",
            "timestamp": (timezone.now() + timedelta(days=1)).strftime("%m-%d-%Y"),
            "startDate": (timezone.now() + timedelta(days=1)).strftime("%m-%d-%Y"),
            "startTime": None,
            "endDate": None,
            "endTime": None,
            "offering": "",
            "price": None,
            "ticket_link": None,
            "is_age_restricted": False,
            "orig_link": None,
            "orig_thumb": uploaded_image_url,
            "isEvent": False,
            "ageBarrier": None,
            "late": None,
            "linkInBio": False,
            "rsvpRequired": False,
            "numEvents": 1,
            "genres": None,
            "is_duplicate": False,
            "forLocation": for_location
        }

        missingFields = 0
        missingDataThreshold = 11
        hasEnoughData = False

        if eventData is not None:
            print("Event details WERE NOT None")
            logger.debug("\n Succesfully labelled event...")

            try:
                newEvent["isEvent"] = True

                if eventData["venue"] is not None:
                    newEvent["venue"]["name"] = eventData["venue"] 

                if eventData["overallAddress"] is not None:
                    newEvent["venue"]["address"] = eventData["overallAddress"] 
                else:
                    missingFields += 1

                if eventData["city"] is not None:
                    newEvent["venue"]["city"] = eventData["city"] 
                else:
                    missingFields += 1

                if eventData["state"] is not None:
                    newEvent["venue"]["state"] = eventData["state"] 
                else:
                    missingFields += 1

                if eventData["country"] is not None:
                    newEvent["venue"]["country"] = eventData["country"] 
                else:
                    missingFields += 1

                if eventData["eventName"] is not None:
                    newEvent["name"] = eventData["eventName"].lstrip('$')
                else:
                    missingFields += 1

                if eventData["artist"] is not None and len(eventData["artist"]) > 0:
                    newEvent["artist"] = eventData["artist"][0]
                else:
                    missingFields += 1

                if eventData["openers"] is not None and len(eventData["openers"]) > 0:
                    newEvent["opener"] = eventData["openers"][0]
                else:
                    missingFields += 1 

                if eventData["hosts"] is not None and len(eventData["hosts"]) > 0:
                    newEvent["host"] = eventData["hosts"][0]
                else:
                    missingFields += 1

                if eventData["promoters"] is not None and len(eventData["promoters"]) > 0:
                    newEvent["promoter"] = eventData["promoters"][0]
                else:
                    missingFields += 1

                if eventData["offerings"] is not None and len(eventData["offerings"]) > 0:
                    newEvent["offering"] = eventData["offerings"][0]
                else:
                    missingFields += 1

                if eventData["startDate"] is not None:
                    newEvent["startDate"] = eventData["startDate"]
                else:
                    missingFields += 1

                if eventData["startDate"] is not None:
                    newEvent["timestamp"] = eventData["startDate"]

                if eventData["endDate"] is not None:
                    newEvent["endDate"] = eventData["endDate"]

                if eventData["startTime"] is not None:
                    newEvent["startTime"] = eventData["startTime"]
                else:
                    missingFields += 1

                if eventData["endTime"] is not None:
                    newEvent["endTime"] = eventData["endTime"]

                if eventData["ageBarrier"] is not None:
                    newEvent["ageBarrier"] = eventData["ageBarrier"]

                if eventData["late"] is not None:
                    newEvent["late"] = eventData["late"]

                if eventData["linkInBio"] is not None:
                    newEvent["linkInBio"] = eventData["linkInBio"]

                if eventData["rsvpRequired"] is not None:
                    newEvent["rsvpRequired"] = eventData["rsvpRequired"]

                if eventData["numEvents"] is not None:
                    newEvent["numEvents"] = eventData["numEvents"]

                if eventData["price"] is not None:
                    newEvent["price"] = eventData["price"]
                else:
                    missingFields += 1

                if eventData["genres"] is not None:
                    newEvent["genres"] = eventData["genres"]

                hasEnoughData = True

            except Exception as e:
                print("Error extracting details: ",str(e))
                logger.debug("\n\n\n Error during details extraction: "+str(e))
                raise e
        else:
            print("Event details WERE None. Total events so far: ",len(events))
            
            logger.debug("\n Event details were NONE")

        logger.debug("An event found!")
        events.append(newEvent)

        try:
            eventsObj = {
                "events": events
            }

            try:
                saved_events = save_events_from_dashboard(headers, eventsObj, exec_id, [account])
                #update_last_run(account)

                return saved_events

            except Exception as e:
                logger.debug("\n\n\n\nError saving events: "+str(e)+"\n\n\n\n")
                raise e

        except Exception as e:
            print("An error occurred persisting the events: ",str(e))
            logger.debug("\n Events not persisted appropriately: "+str(e))
            raise e

    except Exception as e:
        print("An error occurred persisting the events!!: ",str(e))
        logger.debug("\n Events not persisted appropriately: "+str(e))
        raise e

def clean_label_and_save(account: str, exec_id: str, output_file_path: str, images_to_upload: list, headers: dict, for_location: str = None):
    user = account
    timestamp = timezone.now()
    events = []
    # Change from a set to a dictionary that maps event properties to their index in the events list
    seen_events_dict = {}
    
    # Track events by their image link to identify duplicates
    events_by_link = {}
    
    if 'users' in images_to_upload:
        if user in list(images_to_upload['users'].keys()):
            for filename in list(dict(images_to_upload['users'][account]).keys()):
                try:
                    image = images_to_upload['users'][account][filename]
                    logger.debug("\n Image to save: "+str(image))
                    
                    # Check if the image link is blacklisted
                    if is_link_blacklisted(image['link']):
                        log_step_completed(f"Skipping blacklisted image: {image['link']}")
                        continue
                    
                    log_step_progressed(f"An image being uploaded to the cloud: {filename}")

                    image_url = saveImage(
                        exec_id, user, filename, image['path'], image['link'])
                    logger.debug("\n Image URL: "+str(image_url))

                    eventData = None
                
                    with open(output_file_path, "r") as data:
                        images_data = json.loads(data.read())

                    caption = ""
                    biography = ""
                    externalUrl = ""

                    for index, img in enumerate(images_data):
                        if img["shortcode"] == filename:
                            caption = img["caption"]
                            biography = img["biography"]
                            externalUrl = img["externalUrl"]

                    response = label_using_gpt4(image_url,caption,biography,externalUrl)
                    extractedData = response.choices[0].message.content
                    extractedData = re.sub(r'```', '', extractedData)
                    extractedData = re.sub(r'json||\n', '', extractedData)
                    eventData = json.loads(extractedData)

                    newEvent = {
                        "exec_id": exec_id,
                        "poster": user,
                        "venue": {
                            "name": None,
                            "address": None,
                            "city": None,
                            "state": None,
                            "country": None
                        },
                        "name": None,
                        "artist": None,
                        "opener": "",
                        "host": "",
                        "promoter": "",
                        "timestamp": str(timestamp),
                        "startDate": None,
                        "startTime": None,
                        "endDate": None,
                        "endTime": None,
                        "offering": "",
                        "price": None,
                        "ticket_link": image['link'],
                        "is_age_restricted": False,
                        "orig_link": image['link'],
                        "orig_thumb": image_url,
                        "isEvent": False,
                        "ageBarrier": None,
                        "late": None,
                        "linkInBio": False,
                        "rsvpRequired": False,
                        "numEvents": 1,
                        "genres": None,
                        "is_duplicate": False,
                        "duplicate_link": None,
                        "forLocation": for_location
                    }

                    missingFields = 0
                    missingDataThreshold = 11
                    hasEnoughData = False

                    if eventData is not None:
                        print("Event details WERE NOT None")
                        logger.debug("\n Succesfully labelled event...")

                        try:
                            if eventData["isEvent"] is not None:
                                newEvent["isEvent"] = eventData["isEvent"]

                            if eventData["venue"] is not None:
                                newEvent["venue"]["name"] = eventData["venue"] 

                            if eventData["overallAddress"] is not None:
                                newEvent["venue"]["address"] = eventData["overallAddress"] 
                            else:
                                missingFields += 1

                            if eventData["city"] is not None:
                                newEvent["venue"]["city"] = eventData["city"] 
                            else:
                                missingFields += 1

                            if eventData["state"] is not None:
                                newEvent["venue"]["state"] = eventData["state"] 
                            else:
                                missingFields += 1

                            if eventData["country"] is not None:
                                newEvent["venue"]["country"] = eventData["country"] 
                            else:
                                missingFields += 1

                            if eventData["eventName"] is not None:
                                newEvent["name"] = eventData["eventName"].lstrip('$')
                            else:
                                missingFields += 1

                            if eventData["artist"] is not None and len(eventData["artist"]) > 0:
                                newEvent["artist"] = eventData["artist"][0]
                            else:
                                missingFields += 1

                            if eventData["openers"] is not None and len(eventData["openers"]) > 0:
                                newEvent["opener"] = eventData["openers"][0]
                            else:
                                missingFields += 1 

                            if eventData["hosts"] is not None and len(eventData["hosts"]) > 0:
                                newEvent["host"] = eventData["hosts"][0]
                            else:
                                missingFields += 1

                            if eventData["promoters"] is not None and len(eventData["promoters"]) > 0:
                                newEvent["promoter"] = eventData["promoters"][0]
                            else:
                                missingFields += 1

                            if eventData["offerings"] is not None and len(eventData["offerings"]) > 0:
                                newEvent["offering"] = eventData["offerings"][0]
                            else:
                                missingFields += 1

                            if eventData["startDate"] is not None:
                                newEvent["startDate"] = eventData["startDate"]
                            else:
                                missingFields += 1

                            if eventData["startDate"] is not None:
                                newEvent["timestamp"] = eventData["startDate"]

                            if eventData["endDate"] is not None:
                                newEvent["endDate"] = eventData["endDate"]

                            if eventData["startTime"] is not None:
                                newEvent["startTime"] = eventData["startTime"]
                            else:
                                missingFields += 1

                            if eventData["endTime"] is not None:
                                newEvent["endTime"] = eventData["endTime"]

                            if eventData["ageBarrier"] is not None:
                                newEvent["ageBarrier"] = eventData["ageBarrier"]

                            if eventData["late"] is not None:
                                newEvent["late"] = eventData["late"]

                            if eventData["linkInBio"] is not None:
                                newEvent["linkInBio"] = eventData["linkInBio"]

                            if eventData["rsvpRequired"] is not None:
                                newEvent["rsvpRequired"] = eventData["rsvpRequired"]

                            if eventData["numEvents"] is not None:
                                newEvent["numEvents"] = eventData["numEvents"]

                            if eventData["price"] is not None:
                                newEvent["price"] = eventData["price"]
                            else:
                                missingFields += 1

                            if eventData["genres"] is not None:
                                newEvent["genres"] = eventData["genres"]

                            hasEnoughData = missingFields < missingDataThreshold

                        except Exception as e:
                            print("Error extracting details: ",str(e))
                            logger.debug("\n\n\n Error during details extraction: "+str(e))
                    else:
                        print("Event details WERE None. Total events so far: ",len(events))
                        logger.debug("\n Event details were NONE")

                    # Check for event with same image link
                    image_link = image['link']

                    
                    is_story_image = filename.startswith("story_")

                    if newEvent["isEvent"] and hasEnoughData:
                        # Count non-null fields to determine which event has more data
                        #non_null_count = sum(1 for value in newEvent.values() if value is not None)
                        
                        if eventData["textPieces"] is not None:
                            non_null_count = eventData["textPieces"]
                        else:
                            non_null_count = 0

                        if image_link in events_by_link:
                            existing_event = events_by_link[image_link]["event"]
                            existing_non_null_count = events_by_link[image_link]["non_null_count"]
                            
                            if non_null_count > existing_non_null_count:
                                # Current event has more data, mark the existing one as duplicate
                                existing_event["is_duplicate"] = True
                                existing_event["duplicate_link"] = image_link
                                
                                # Replace with current event as primary
                                events_by_link[image_link] = {
                                    "event": newEvent,
                                    "non_null_count": non_null_count
                                }
                                logger.info(
                                    "[CAROUSEL_TEXT_PREF] WIN | account=%r filename=%r "
                                    "textPieces_new=%d > textPieces_existing=%d link=%r — "
                                    "new slide replaces old as primary",
                                    account, filename, non_null_count, existing_non_null_count, image_link,
                                )
                                log_step_progressed(f"Better version of duplicate event found: {filename}")
                            else:
                                # Current event has less data, mark it as duplicate
                                newEvent["is_duplicate"] = True
                                newEvent["duplicate_link"] = image_link
                                logger.info(
                                    "[CAROUSEL_TEXT_PREF] LOSS | account=%r filename=%r "
                                    "textPieces_new=%d <= textPieces_existing=%d link=%r — "
                                    "existing slide kept as primary",
                                    account, filename, non_null_count, existing_non_null_count, image_link,
                                )
                                log_step_progressed(f"Marking as duplicate event: {filename}")
                        else:
                            # First encounter of this image link
                            events_by_link[image_link] = {
                                "event": newEvent,
                                "non_null_count": non_null_count
                            }

                            # Add this link to the blacklisted links collection
                            blacklist_link(image_link)

                            logger.info(
                                "[CAROUSEL_TEXT_PREF] FIRST_SEEN | account=%r filename=%r "
                                "textPieces=%d link=%r — recorded as first candidate for this post",
                                account, filename, non_null_count, image_link,
                            )
                            log_step_progressed(f"New unique event found: {filename}")

                        if is_story_image:
                            logger.info(
                                "[STORY_EVENT_EXTRACTED] account=%r filename=%r "
                                "name=%r startDate=%r venue=%r is_duplicate=%s",
                                account, filename,
                                newEvent.get("name"),
                                newEvent.get("startDate"),
                                newEvent.get("venue", {}).get("address"),
                                newEvent.get("is_duplicate"),
                            )
                        
                        # Also check for similar events based on properties
                        event_key = (newEvent["name"], newEvent["venue"]["address"], newEvent["startDate"], newEvent["artist"])
                        match_found = False
                        
                        for seen_key in seen_events_dict:
                            if is_similar(event_key, seen_key):
                                match_found = True
                                # Mark as duplicate if it's similar to another event by properties
                                if not newEvent["is_duplicate"] and newEvent["isEvent"] and hasEnoughData:
                                    newEvent["is_duplicate"] = True
                                    # Use the index stored in the dictionary to get the original event's link
                                    original_event_index = seen_events_dict[seen_key]
                                    newEvent["duplicate_link"] = events[original_event_index]["orig_link"]
                                    log_step_progressed(f"Marking as duplicate of similar event: {filename}")
                                break
                        
                        if not match_found and newEvent["isEvent"] and hasEnoughData and not newEvent["is_duplicate"]:
                            # Store the index of this event in the events list along with its key
                            seen_events_dict[event_key] = len(events)

                    # Then check for duplicates in database
                    if not newEvent["is_duplicate"]:
                        is_db_duplicate, duplicate_id = is_event_duplicate_in_db(newEvent)
                        if is_db_duplicate:
                            newEvent["is_duplicate"] = True
                            newEvent["duplicate_link"] = f"database_event_{duplicate_id}"
                            log_step_progressed(f"!Marking as duplicate of existing database event: {filename}")

                    # Always add the event to the list (whether it's a duplicate or not)
                    events.append(newEvent)
                    
                except Exception as e:
                    error_message = f"An error occurred while labelling {filename}: {str(e)}"
                    traceback_info = traceback.format_exc()
                    log_step_failed(f"{error_message}\nTraceback:\n{traceback_info}")
                    print("An error occurred while labelling: ",str(e))
                    logger.debug("\n Error during labelling post: "+str(e))
            
            try:
                eventsObj = {
                    "events": events
                }

                try:
                    num_saved_events = save_events(headers, eventsObj, exec_id, [account])
                    update_last_run(account)
                    return num_saved_events
                except Exception as e:
                    logger.debug("\n\n\n\nError saving events: "+str(e)+"\n\n\n\n")
                    return 0

                logger.debug("\n Events persisted appropriately ")
            except Exception as e:
                print("An error occurred persisting the events: ",str(e))
                logger.debug("\n Events not persisted appropriately: "+str(e))
                return 0


def temporarySaveToServer(exec_id: str, execution: dict, images_to_upload: dict, existing_config: dict, headers: dict, output_file_path: str, accounts: list):
    executions = {}
    last_exec = -1

    print("Existing config: ",existing_config)

    try:
        if 'executions' in existing_config:
            executions = existing_config['executions']

        if 'last_exec' in existing_config:
            last_exec = existing_config['last_exec']

        executions = {}

        executions[exec_id] = execution

        config_data = {
            "last_fetched": int(time.time()),
            'last_exec': last_exec,
            'executions': executions
        }

        timestamp = datetime.now()
        #timestamp = timestamp + timedelta(days=10)

        events = []
        if 'users' in images_to_upload:
            for user in list(images_to_upload['users'].keys()):
                for filename in list(dict(images_to_upload['users'][user]).keys()):
                    image = images_to_upload['users'][user][filename]

                    logger.debug("\n Image to save: "+str(image))

                    image_url = saveImage(
                        exec_id, user, filename, image['path'], image['link'])

                    logger.debug("\n Image URL: "+str(image_url))

                    eventData = None

                    try:
                        with open(output_file_path, "r") as data:
                            images_data = json.loads(data.read())

                        caption = ""
                        biography = ""
                        externalUrl = ""

                        for index, img in enumerate(images_data):
                            #print("File name: ",filename,"\n\n")
                            #print("Image url: ",image_url,"\n\n")
                            #print("Image datum: ",img,"\n\n\n")
                            if img["shortcode"] == filename:
                                caption = img["caption"]
                                biography = img["biography"]
                                externalUrl = img["externalUrl"]

                        response = label_using_gpt4(image_url,caption,biography,externalUrl)

                        extractedData = response.choices[0].message.content

                        extractedData = re.sub(r'```', '', extractedData)

                        extractedData = re.sub(r'json||\n', '', extractedData)

                        eventData = json.loads(extractedData)

                    except Exception as e:
                        print("An error occurred while labelling: ",str(e))
                        logger.debug("\n Error during labelling post: "+str(e))
                        


                    newEvent = {
                        "exec_id": exec_id,
                        "poster": user,
                        "venue": {
                            "name": None,
                            "address": None,
                            "city": None,
                            "state": None,
                            "country": None
                        },
                        "name": None,
                        "artist": None,
                        "opener": "",
                        "host": "",
                        "promoter": "",
                        "timestamp": str(timestamp),
                        "startDate": None,
                        "startTime": None,
                        "endDate": None,
                        "endTime": None,
                        "offering": "",
                        "price": None,
                        "ticket_link": image['link'],
                        "is_age_restricted": False,
                        "orig_link": image['link'],
                        "orig_thumb": image_url,
                        "isEvent": False,
                        "ageBarrier": None,
                        "late": None,
                        "linkInBio": False,
                        "rsvpRequired": False,
                        "numEvents": 1,
                        "forLocation": None
                    }

                    if eventData is not None:
                        print("Event details WERE NOT None")
                        logger.debug("\n Succesfully labelled event")
                        try:
                            if eventData["isEvent"] is not None:
                                newEvent["isEvent"] = eventData["isEvent"] 

                            if eventData["venue"] is not None:
                                newEvent["venue"]["name"] = eventData["venue"] 

                            if eventData["overallAddress"] is not None:
                                newEvent["venue"]["address"] = eventData["overallAddress"] 

                            if eventData["city"] is not None:
                                newEvent["venue"]["city"] = eventData["city"] 

                            if eventData["state"] is not None:
                                newEvent["venue"]["state"] = eventData["state"] 

                            if eventData["country"] is not None:
                                newEvent["venue"]["country"] = eventData["country"] 

                            if eventData["eventName"] is not None:
                                newEvent["name"] = eventData["eventName"].lstrip('$') 

                            if eventData["artist"] is not None and len(eventData["artist"]) > 0:
                                newEvent["artist"] = eventData["artist"][0] 

                            if eventData["openers"] is not None and len(eventData["openers"]) > 0:
                                newEvent["opener"] = eventData["openers"][0] 

                            if eventData["hosts"] is not None and len(eventData["hosts"]) > 0:
                                newEvent["host"] = eventData["hosts"][0] 

                            if eventData["promoters"] is not None and len(eventData["promoters"]) > 0:
                                newEvent["promoter"] = eventData["promoters"][0] 

                            if eventData["offerings"] is not None and len(eventData["offerings"]) > 0:
                                newEvent["offering"] = eventData["offerings"][0] 

                            if eventData["startDate"] is not None:
                                newEvent["startDate"] = eventData["startDate"] 

                            if eventData["startDate"] is not None:
                                newEvent["timestamp"] = eventData["startDate"] 

                            if eventData["endDate"] is not None:
                                newEvent["endDate"] = eventData["endDate"] 

                            if eventData["startTime"] is not None:
                                newEvent["startTime"] = eventData["startTime"] 

                            if eventData["endTime"] is not None:
                                newEvent["endTime"] = eventData["endTime"] 

                            if eventData["ageBarrier"] is not None:
                                newEvent["ageBarrier"] = eventData["ageBarrier"] 

                            if eventData["late"] is not None:
                                newEvent["late"] = eventData["late"] 

                            if eventData["linkInBio"] is not None:
                                newEvent["linkInBio"] = eventData["linkInBio"] 

                            if eventData["rsvpRequired"] is not None:
                                newEvent["rsvpRequired"] = eventData["rsvpRequired"] 

                            if eventData["numEvents"] is not None:
                                newEvent["numEvents"] = eventData["numEvents"] 

                            if eventData["price"] is not None:
                                newEvent["price"] = eventData["price"] 

                            #print("New event now: ",newEvent,"\n\n\n")
                            #print("Total events so far: ",len(events))
                        except Exception as e:
                            print("Error extracting details: ",str(e))
                            logger.debug("\n Error during details extraction: "+str(e))
                    else:
                        print("Event details WERE None. Total events so far: ",len(events))
                        logger.debug("\n Event details were NONE")

                    if newEvent["isEvent"] == True:
                        print("An event found!")
                        events.append(newEvent)

        try:
            eventsObj = {
                "events": events
            }

            try:
                save_events(headers, eventsObj, exec_id, accounts)
                for account in accounts:
                    update_last_run(account)

            except Exception as e:
                logger.debug("\n\n\n\nError saving events: "+str(e)+"\n\n\n\n")

            prettyJSON = json.dumps(config_data, indent=2)

            print("Config Data: ",prettyJSON)

            requests.put(url=ADMIN_CONFIG_ENDPOINT,
                         data=json.dumps({
                             "is_complete": True,
                             "config": config_data
                         }), headers=headers)

            logger.debug("\n Events persisted appropriately ")
        except Exception as e:
            print("An error occurred persisting the events: ",str(e))
            logger.debug("\n Events not persisted appropriately: "+str(e))
    except Exception as e:
        print("An error occurred labelling+persisting the events: ",str(e))
        logger.debug("\n Events not labelled+persisted appropriately: "+str(e))


# def saveImages(savedEventIDs, imagesToUpload):
#     for i in range(len(imagesToUpload)):
#         imagePath = imagesToUpload[i]
#         imgB64Str = ""
#         with open(imagePath, "rb") as img_file:
#             imgB64Str = base64.b64encode(img_file.read())

#         requests.post(url=IMAGE_UPLOAD_CLOUD_FUNCTION_URL,
#                       data={
#                           "event_id": savedEventIDs[i],
#                           "image": imgB64Str
#                       })

@retry(stop=stop_after_attempt(3), wait=wait_fixed(10))
def saveImage(exec_id: str, user: str, filename: str, imagePath: str, link: str):
    imgB64Str = ""
    with open(imagePath, "rb") as img_file:
        imgB64Str = base64.b64encode(img_file.read())

        os.remove(imagePath)

    print("Image details::: \n",filename,"\n",link,"\n",user,user.replace(".","-"),"\n\n\n")
    print("Image: \n",imagePath,"\n....\n",imgB64Str)
    print("More: \n",exec_id,"\n...",link)

    logger.debug(f"Image details:-: \n{filename}\n{link}\n{user}\n{user.replace('.','-')}\n\n\n")
    logger.debug(f"Image: \n{imagePath}\n....\n{imgB64Str}")
    logger.debug(f"More: \n{exec_id}\n...{link}")
    logger.debug(f"CHECK: {imgB64Str}")

    imageReq = requests.post(url=IMAGE_UPLOAD_CLOUD_FUNCTION_URL,
                             data={
                                 "exec_id": exec_id,
                                 "user": user.replace(".","-"),
                                 "filename": filename,
                                 "image": imgB64Str,
                                 "link": link
                             })

    log_step_progressed(f"Cloud Image Upload result for {filename}: {imageReq.text}")
    logger.debug("Cloud Image Upload result: "+ imageReq.text)

    return imageReq.text


def scrape_using_insta_api():
    """
        Yet to be implemented
    """
    pass

def is_link_blacklisted(link):
    """
    Check if a link is in the blacklist table.
    
    Args:
        link (str): The URL to check
        
    Returns:
        bool: True if the link is blacklisted, False otherwise
    """
    try:
        return BlacklistedLink.objects.filter(url=link).exists()
    except Exception as e:
        logger.error(f"Error checking blacklisted link: {str(e)}")
        return False

def blacklist_link(link):
    """
    Add a link to the blacklist table.
    
    Args:
        link (str): The URL to blacklist
    """
    try:
        BlacklistedLink.objects.create(url=link)
    except Exception as e:
        logger.error(f"Error blacklisting link: {str(e)}")

def is_event_duplicate_in_db(event):
    """
    Check if an event is a duplicate of any recent event in the database
    
    Args:
        event (dict): The new event to check
        
    Returns:
        tuple: (is_duplicate, duplicate_event_id or None)
    """
    try:
        # Get 7 days ago
        last_week = timezone.now().date() - timedelta(days=7)
        
        # Query events from 7 days ago onwards
        recent_events = Event.objects.filter(start_date__gte=last_week)
        
        for db_event in recent_events:
            # Create comparable tuples
            new_event_tuple = (
                event["name"] or "", 
                event["venue"]["address"] or "", 
                event["startDate"] or "", 
                event["artist"] or ""
            )
            
            db_event_tuple = (
                db_event.name or "",
                db_event.address or "",
                db_event.start_date.strftime("%m-%d-%Y") if db_event.start_date else "",
                db_event.artist or ""
            )
            
            # Use the existing similarity function
            if is_similar(new_event_tuple, db_event_tuple):
                return True, db_event.id
                
        return False, None
    except Exception as e:
        logger.error(f"Error checking for duplicate events in DB: {str(e)}")
        return False, None
