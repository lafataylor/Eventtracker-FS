import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

admin_email = os.getenv('ADMIN_EMAIL')
admin_password = os.getenv('ADMIN_PASSWORD')

# Ensure the environment variables are set
if not admin_email or not admin_password:
    print("Environment variables ADMIN_EMAIL and/or ADMIN_PASSWORD are not set.")
    exit(1)

# API endpoint
url = "https://eventtrackerapi.lafaslist.com/v1/auth/login/"
accounts_url = "https://eventtrackerapi.lafaslist.com/v1/admin/accounts/"
read_logs_url = "https://eventtrackerapi.lafaslist.com/v1/admin/system/logs/"
run_scraper_url = "https://eventtrackerapi.lafaslist.com/v1/admin/runScraper/"

# Payload for the login request
payload = {
    "email": admin_email,
    "password": admin_password
}

try:
    # Send the POST request to the API
    response = requests.post(url, json=payload)

    # Check if the request was successful
    if response.status_code == 200:
        print("Login successful")
        response_data = response.json()
        jwt_token = response_data.get('jwtToken')
        print(f"JWT Token: {jwt_token}")

        headers = {
            'Authorization': f'Bearer {jwt_token}'
        }

        run_logs = requests.get(read_logs_url, headers=headers)

        run_logs = run_logs.json()

        statuses = set()

        for log in run_logs["data"]:
            statuses.add(log["status"])

        if "In Progress" in statuses:
            print("A run is already in progress")
            exit(1)
        else:

            # Send the GET request to the accounts endpoint
            accounts_response = requests.get(accounts_url, headers=headers)

            accounts_list = []

            if accounts_response.status_code == 200:
                accounts = accounts_response.json()
                for account in accounts:
                    accounts_list.append(account["user"])

                scraper_payload = {
                    "accounts": accounts_list
                }

                scraper_response = requests.post(run_scraper_url, json=scraper_payload, headers=headers)

                if scraper_response.status_code == 200:
                    print("Scraper run successfully.")
                    print("Response data:", scraper_response.json())
                else:
                    print(f"Failed to run scraper with status code {scraper_response.status_code}")
                    print("Response data:", scraper_response.text)

            else:
                print(f"Failed to retrieve accounts data with status code {accounts_response.status_code}")
                print("Response data:", accounts_response.text)
    else:
        print(f"Login failed with status code {response.status_code}")
        print("Response data:", response.text)

except requests.exceptions.RequestException as e:
    print(f"An error occurred: {e}")