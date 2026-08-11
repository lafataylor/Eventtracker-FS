import subprocess
import sys

from scraper import *
from session import *
from constants import *

import base64

if __name__ == "__main__":
    headers = get_headers()

    #accounts = get_admin_accounts(headers)
    accounts = ["do_over"]

    if len(accounts) > 0:
        config = get_config(headers)

        print("Config: ",config)

        if not accounts:
            raise ValueError('No accounts to scrape')

        """if not check_for_prerequisites():
            raise FileExistsError('Must install instatouch (node package)')"""

        """session_id, session_date = get_active_session_id_and_date()

        if not session_id or session_restore_required(session_date=session_date):
            session_id, session_date = restore_session(
                user_name=LOGIN_USER, user_password=LOGIN_PASS)"""

        exec_id = get_exec()

        print("Exec id: ",exec_id)

        """download_images(accounts=accounts, session_id=session_id, headers=headers,
                        config=config, exec_id=exec_id)"""

        download_images(accounts=accounts, session_id="test", headers=headers,
                        config=config, exec_id=exec_id)
