from django.urls import path
from .views import *

urlpatterns = [
    path("auth/login/", login),
    path("auth/register/", register),
    path("auth/userLogin/", user_login),
    path("auth/userRegister/", user_register),
    path('auth/refreshToken/', refresh_token),
    path('auth/getAllUsers/', get_all_users),
    path('auth/editUser/', edit_user),
]