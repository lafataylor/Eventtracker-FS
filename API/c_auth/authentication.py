import jwt, datetime
from c_auth.models import User

def create_jwt_token(user_id: str, duration: int):
    payload = {
            'id': user_id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=duration),
            'iat': datetime.datetime.utcnow()
    }

    jwt_token = jwt.encode(payload, 'secret', algorithm='HS256')

    refresh_payload = {
        'id': user_id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=30),  # Refresh token valid for 30 days
        'iat': datetime.datetime.utcnow()
    }
    
    refresh_token = jwt.encode(refresh_payload, 'refresh-secret', algorithm='HS256')

    return jwt_token, refresh_token

def authenticate_jwt_token(jwt_token: str):
    try:
        payload = jwt.decode(jwt_token, 'secret', algorithms=['HS256'])
    except:
        return False

    user_id = payload.get("id")
    if user_id:
        user = User.objects.get(id=payload['id'])
        if user:
            return True

    return False

def get_token_id(token:str):
    token_id = token.replace("Token ", "").replace("Bearer ", "")
    return token_id

def get_uid_from_token(token:str):
    token_id = get_token_id(token)
    try:
        payload = jwt.decode(token_id, 'secret', algorithms=['HS256'])
    except:
        return None

    user_id = str(payload.get("id"))
    return user_id
