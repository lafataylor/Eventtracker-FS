# secret
BASE_URL = 'https://www.instagram.com/'
LOGIN_URL = BASE_URL + 'accounts/login/ajax/'
LOGOUT_URL = BASE_URL + 'accounts/logout/'
#STORIES_UA = 'Instagram 123.0.0.21.114 (iPhone; CPU iPhone OS 11_4 like Mac OS X; en_US; en-US; scale=2.00; 750x1334) AppleWebKit/605.1.15'
STORIES_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 11_2_6 like Mac OS X) AppleWebKit/604.5.6 (KHTML, like Gecko) Mobile/15D100 Instagram 37.0.0.9.96 (iPhone7,2; iOS 11_2_6; pt_PT; pt-PT; scale=2.34; gamut=normal; 750x1331)"
ADMIN_EMAIL = "dummy_@gmail.com"
ADMIN_PASSWORD = "dummy_"

# api
LOGIN_USER = "malik.steed"
LOGIN_PASS = "steed777"
APP_ID = "638306808080503"
APP_SECRET = "cef4c63d15718c15ba0745626cd0c82b"
CLIENT_TOKEN = "faa1485a2d9e765816556daba15434d0"
# "IGQVJYQnBlYUVMV09IcE50czgtWHRYSXRCTmk0S1BlNXNLUmlYRC14SW9MemZAQMDRTVkQ5VzhEbWNaUEc5dk5sNmdiNXUxV3FMN1NtOEM4MThIMmFMcG5XTk5RRlFjUllIdU5fcUpFekhOS3pmOVNWQQZDZD"
ACCESS_TOKEN = "IGQVJVWWY1VC11dnhNN3hVZAXFqMXpKM3o1Uk9pSGc1X1d3S1NtT1h3eFJmU01zNzVMQ25DSXc2M05mYmR0SEtSM2VORnE5eTAxLXJkaDljdmRSNDdEcWg2dWk0elBXRExRNmhNNHdzanNMcVoyMkYtVwZDZD"

# endpoints
# The scraper and the manual add-by-URL path save events by calling this API
# over HTTP (legacy design). On the production server the API calls itself, so
# the default stays the prod domain. Locally this MUST be overridden to the
# local API (EVENT_API_HOST in .env) or a dev machine will write into the
# production database.
import os as _os
# The trailing slash is normalised on purpose (same convention as
# FE/services/apiClient.tsx): endpoints below concatenate HOST + VERSION, so
# HOST must end in exactly one '/'. Without this, EVENT_API_HOST set without a
# trailing slash would build 'http://127.0.0.1:8009v1/...'.
HOST = _os.getenv("EVENT_API_HOST", "https://eventtrackerapi.lafaslist.com/").rstrip("/") + "/"
VERSION = "v1"
SAVE_LOGS_ENDPOINT = HOST + VERSION + "/admin/system/logs/save/"
CREATE_EXECUTION_ENDPOINT = HOST + VERSION + "/admin/execution/"
LOGIN_ENDPOINT = HOST + VERSION + "/auth/login/"
ADMIN_ACCOUNTS_ENDPOINT = HOST + VERSION + "/admin/accounts/"
ADMIN_CREATE_EVENT_ENDPOINT = HOST + VERSION + "/admin/event/"
ADMIN_CONFIG_ENDPOINT = HOST + VERSION + "/admin/config/"

IMAGE_UPLOAD_CLOUD_FUNCTION_URL = 'https://us-central1-eventtracker-1c82b.cloudfunctions.net/uploadImage'

# other
WEB_SCRAPER = "Web Scraper"
INSTA_API = "Instagram API"
