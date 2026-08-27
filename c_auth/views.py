from rest_framework.decorators import api_view
from rest_framework.response import Response

from .serializers import UserSerializer
from .models import User

import uuid

import jwt

from .authentication import create_jwt_token

from event_tracker_api.validator import Validator 
from event_tracker_api.response import *

import logging
logger = logging.getLogger('django')

validator = Validator()

from dotenv import load_dotenv
import os
from django.conf import settings

# Load environment variables from .env.local
load_dotenv(dotenv_path=os.path.join(settings.BASE_DIR, '.env.local'))

@api_view(["POST"])
def register(request):
    email = request.data.get("email")
    password = request.data.get("password")
    secretKey = request.data.get("secret_key")
    expected_secret_key = os.getenv("SECRET_KEY")

    if secretKey != expected_secret_key:
        return Response({
            "status": "error",
            "message": "Secret key is invalid"
        }, status=403)

    if validator.is_missing([email, password]):
        return MissingInformation()
    if not validator.is_valid([[email, str], [password, str]]):
        return InvalidParameters()

    serializer = UserSerializer(data={
        "id":str(uuid.uuid4().int), 
        "email": email, 
        "password": password
    })
    serializer.is_valid()
    serializer.save()

    jwt_token, refresh_token = create_jwt_token(user_id=serializer.data.get("id"), duration=60)

    return Response({
        "status": "success",
        "jwtToken": jwt_token,
        "refreshToken": refresh_token
    })

@api_view(["POST"])
def login(request):
    email = request.data.get("email")
    password = request.data.get("password")

    #logger.debug("Login function test")

    #print("Login function test")

    if validator.is_missing([email, password]):
        return MissingInformation
    if not validator.is_valid([[email, str], [password, str]]):
        return InvalidParameters()

    user = User.objects.filter(email=email).first()

    if not user:
        return UserNotFound()

    if not user.check_password(password):
        return IncorrectPassword()

    if user.usertype != 'admin':
        return Response({
            "status": "error",
            "message": "Only admin users are allowed to login"
        }, status=403)

    jwt_token, refresh_token = create_jwt_token(user_id=user.id, duration=60)

    return Response({
        "status": "success",
        "jwtToken": jwt_token,
        "refreshToken": refresh_token
    })
    
@api_view(["POST"])
def user_register(request):
    email = request.data.get("email")
    password = request.data.get("password")
    firstName = request.data.get("first_name", "")
    lastName = request.data.get("last_name", "")
    description = request.data.get("description", "")

    if validator.is_missing([email, password]):
        return MissingInformation()
    if not validator.is_valid([[email, str], [password, str]]):
        return InvalidParameters()

    serializer = UserSerializer(data={
        "id": str(uuid.uuid4().int),
        "email": email,
        "password": password,
        "usertype": "regular",
        "firstName": firstName,
        "lastName": lastName,
        "description": description
    })
    if serializer.is_valid():
        user = serializer.save()
        user.set_password(password)  # Set the password correctly
        user.save()  # Save the user again with the correctly hashed password
    else:
        return Response({"status": "error", "message": serializer.errors}, status=400)

    jwt_token, refresh_token = create_jwt_token(user_id=user.id, duration=60)

    return Response({
        "status": "success",
        "jwtToken": jwt_token,
        "refreshToken": refresh_token
    })

@api_view(["POST"])
def user_login(request):
    email = request.data.get("email")
    password = request.data.get("password")

    logger.debug("Login function test")

    print("Login function test")

    if validator.is_missing([email, password]):
        return MissingInformation
    if not validator.is_valid([[email, str], [password, str]]):
        return InvalidParameters()

    user = User.objects.filter(email=email).first()

    if not user:
        return UserNotFound()

    if not user.check_password(password):
        return IncorrectPassword()

    jwt_token, refresh_token = create_jwt_token(user_id=user.id, duration=60)

    return Response({
        "status": "success",
        "jwtToken": jwt_token,
        "refreshToken": refresh_token,
        "user": {
            "id": user.id,
            "email": user.email,
            "firstName": user.firstName,
            "lastName": user.lastName,
            "usertype": user.usertype,
            "description": user.description
        }
    })


@api_view(["POST"])
def refresh_token(request):
    refresh_token = request.data.get("refreshToken")

    if not refresh_token:
        return Response({"status": "error", "message": "Refresh token is missing"}, status=400)

    try:
        payload = jwt.decode(refresh_token, 'refresh-secret', algorithms=['HS256'])
        user_id = payload['id']
    except jwt.ExpiredSignatureError:
        return Response({"status": "error", "message": "Refresh token has expired"}, status=400)
    except jwt.InvalidTokenError:
        return Response({"status": "error", "message": "Invalid refresh token"}, status=400)

    new_jwt_token, new_refresh_token = create_jwt_token(user_id=user_id, duration=60)

    return Response({
        "status": "success",
        "jwtToken": new_jwt_token,
        "refreshToken": new_refresh_token
    })

@api_view(["PUT"])
def edit_user(request):
    user_id = request.data.get("user_id")
    
    if not user_id:
        return Response({
            "status": "error",
            "message": "User ID is required"
        }, status=400)
    
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return UserNotFound()
    
    # Fields that can be updated
    updatable_fields = [
        'email', 'firstName', 'lastName', 'description', 'usertype', 'linkedAccounts'
    ]
    
    # Update only provided fields
    updated = False
    for field in updatable_fields:
        field_key = field
        if field == 'firstName':
            field_key = 'first_name'
        elif field == 'lastName':
            field_key = 'last_name'
        elif field == 'linkedAccounts':
            field_key = 'linkedAccounts'
            
        value = request.data.get(field_key)
        if value is not None:
            setattr(user, field, value)
            updated = True
    
    # Handle password update separately for proper hashing
    password = request.data.get('password')
    if password:
        user.set_password(password)
        updated = True
    
    if updated:
        user.save()
        
    # Return updated user data
    return Response({
        "status": "success",
        "message": "User updated successfully",
        "user": {
            "id": user.id,
            "email": user.email,
            "firstName": user.firstName,
            "lastName": user.lastName,
            "usertype": user.usertype,
            "description": user.description,
            "linkedAccounts": user.linkedAccounts
        }
    })

@api_view(["GET"])
def get_all_users(request):
    try:
        users = User.objects.all()
        serializer = UserSerializer(users, many=True)
        
        return Response({
            "status": "success",
            "users": serializer.data
        })
    except Exception as e:
        logger.error(f"Error getting users: {str(e)}")
        return Response({
            "status": "error",
            "message": "Failed to retrieve users"
        }, status=500)

