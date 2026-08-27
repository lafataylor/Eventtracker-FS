import requests
from pathlib import Path
import json
from datetime import datetime

from constants import *
from exceptions import *


BASE_DIR = Path(__file__).resolve().parent
SESSION_FILE = BASE_DIR / "session_data.json"


def save_session(session_data: dict):
    try:
        with open(SESSION_FILE, "w+") as session_data_file:
            session_data_file.write(json.dumps(session_data))
    except Exception as exception:
        SessionSaveError(exception)


def restore_session(user_name: str, user_password: str):
    session = requests.Session()

    try:
        session.headers.update({'Referer': BASE_URL, 'user-agent': STORIES_UA})
        req = session.get(
            'https://i.instagram.com/api/v1/public/landing_info/')
        session.headers.update({'X-CSRFToken': session.cookies['csrftoken']})
        login_data = {'username': user_name, 'password': user_password}
        login = session.post(LOGIN_URL, data=login_data, allow_redirects=True)

        print(login.text)
    except Exception as exception:
        LoginError(exception)
    session_data = session.cookies.get_dict()
    sessionid = session_data.get("sessionid")
    ds_user_id = session_data.get("ds_user_id")

    today = datetime.now().date()
    session_data["date"] = str(today)
    save_session(session_data)

    session_id = f"sessionid={sessionid}; ds_user_id={ds_user_id}"

    return session_id, today


def get_active_session_id_and_date():
    try:
        with open(SESSION_FILE, "r") as session_data_file:
            session_data = json.loads(session_data_file.read())

        sessionid = session_data.get("sessionid")
        ds_user_id = session_data.get("ds_user_id")

        session_date = session_data.get("date")

        session_id = f"sessionid={sessionid}; ds_user_id={ds_user_id}"
    except:
        session_id = None
        session_date = None

    return session_id, session_date


def session_restore_required(session_date: str):
    today = str(datetime.now().date())

    if session_date == today:
        return False

    return True
