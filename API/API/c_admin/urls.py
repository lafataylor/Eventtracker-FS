from django.urls import path
from .views import *

urlpatterns = [
    path("admin/user/", add_user),
    path("admin/accounts/", AdminAccounts.as_view()),
    path("admin/runScraper/", AdminRunScraper.as_view()),
    path("admin/createEventFromDashboard/", create_event_from_dashboard),
    path("admin/createEventFromInstagram/", create_event_from_instagram_link),
    path("admin/preferences/", AdminPreferences.as_view()),
    path("admin/system/logs/", read_logs),
    path("admin/system/logs/save/", save_logs),
    path("admin/execution/", AdminExecutions.as_view()),
    path("admin/config/", AdminConfig.as_view()),
    path("admin/keywords/", AdminKeywords.as_view()),
    path("admin/errors/notifs/", AdminErrorsNotifs.as_view()),
    path("admin/errors/", AdminErrors.as_view()),
    path("admin/feedback/", AdminFeedback.as_view()),
    path("admin/uploadImage/", upload_image),
    path("admin/geocode/", geocode_address),
    path("admin/geocode/stats/", get_cached_geocoding_stats),
    path("admin/geocode/clear/", clear_geocoding_cache),
    path("admin/details/", AdminAccountDetails.as_view()),
    path("admin/details/fields/", list_detail_fields),
]
