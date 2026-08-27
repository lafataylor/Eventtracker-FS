from django.contrib import admin
from django.conf import settings
from django.views.generic import TemplateView
from django.urls import path, include

# Basic apps
urlpatterns = [
    path(f'{settings.API_VERSION}/documentation/', TemplateView.as_view(
        template_name="doc/api-doc.html",
        extra_context={'schema_url': 'openapi-schema'}
    ), name='api-doc')
]

# Created apps
urlpatterns += [path(f"{settings.API_VERSION}/", include(f'{app_name}.urls')) for app_name in settings.CREATED_APPS]