from django.contrib import admin
from .models import *


admin.site.register(Logs)
admin.site.register(Account)
admin.site.register(Keywords)
admin.site.register(LastRun)
admin.site.register(UserFeedback)
admin.site.register(GeocodingCache)