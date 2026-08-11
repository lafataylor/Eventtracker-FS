from django.urls import path
from .views import *

urlpatterns = [
    path("event/", event),
    path("admin/event/", AdminEvent.as_view()),
    path("event/user/", user_events),
    path("event/search/", search_events),
    path("event/date/", date_events),
    path("event/date/range/", date_range_events),
    path("event/filter/", filter_events),
    path("event/feedback/", add_event_feedback),
    path("event/favorites/", get_favorites),
    path("event/favorites/add/", add_to_favorites),
    path("event/favorites/remove/", remove_from_favorites),
    path("event/recoverDuplicate/", remove_duplicate_label),
    path("event/addDuplicate/", add_duplicate_label),
    path("event/getDuplicateEvents/", get_duplicate_events),
    path("event/locations/", list_locations),
]
