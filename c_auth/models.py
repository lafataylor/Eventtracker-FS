from django.db import models
from django.contrib.auth.models import AbstractUser

# Custom user models here.
class User(AbstractUser):
    email = models.CharField(max_length=255, unique=True)
    password = models.CharField(max_length=255)
    username = None
    usertype = models.CharField(max_length=50, default='admin')
    firstName = models.CharField(max_length=255, null=True, blank=True)
    lastName = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    linkedAccounts = models.CharField(max_length=255, null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []