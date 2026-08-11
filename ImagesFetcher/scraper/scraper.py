import subprocess
import requests
import time
from datetime import datetime, timedelta
import json
import re
import os
import math
import shutil
import base64
import threading

from constants import *
from exceptions import *

from apify_client import ApifyClient
from PIL import Image
from io import BytesIO

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

client = OpenAI()

def check_for_prerequisites():
    prerequisites = ["instatouch"]
    try:
        for prerequisite in prerequisites:
            subprocess.call([prerequisite],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.STDOUT)
    except FileNotFoundError:
        return False
    return True


def get_number_of_posts_downloaded(file_path):
    try:
        with open(file_path, "r") as downloaded_posts_file:
            download_posts_data = json.loads(downloaded_posts_file.read())
            return len(download_posts_data)
    except:
        return 0


def get_display_url_for_images(file_path, min_time):
    try:
        posts_data = []
        with open(file_path, "r") as posts_file:
            posts_data = json.loads(posts_file.read())

        images = {}
        for post in posts_data:
            if post['taken_at_timestamp'] > min_time:
                images[post['shortcode']] = {
                    "image_url": post['display_url'],
                    "link": f"https://www.instagram.com/p/{post['shortcode']}/"
                }

        return images
    except Exception as e:
        print("An error: ",str(e))
        return {}


def get_path_for_images(account, file_path, min_time):
    try:
        posts_data = []
        with open(file_path, "r") as posts_file:
            posts_data = json.loads(posts_file.read())

        images = {}
        for post in posts_data:
            if post['taken_at_timestamp'] > min_time:
                images[post['shortcode']] = {
                    "path": f"./posters/{account}/{post['shortcode']}.jpeg",
                    "link": f"https://www.instagram.com/p/{post['shortcode']}/"
                }

        return images
    except:
        return {}

def convert_timestamp_to_float(timestamp_str):
    try:
        timestamp_dt = datetime.strptime(timestamp_str, '%Y-%m-%dT%H:%M:%S.%fZ')

        timestamp_float = timestamp_dt.timestamp()

        return timestamp_float
    except ValueError as e:
        print(f"Error: {e}")
        return None


def scrape_using_instatouch(account: str, session_id: str, output_file_name: str, output_file_path: str, count: int):
    executable_command = [
        "instatouch", "user", account,
        "--session", session_id,
        "-c", str(count),
        "-m", "image",
        "-f", output_file_name,
        "--filepath", "./posters/",
        "-t", "json",
        "-d"
    ]

    try:
        download_account_posts = subprocess.Popen(
            executable_command,
            stdout=subprocess.PIPE
        )

        output, err = download_account_posts.communicate()
    except Exception as e:
        return False

    if not os.path.exists(output_file_path):
        return False
    return True

def scrape_using_apify(account: str, output_file_name: str, output_file_path: str, count: int, last_fetched: str):
    def download_and_save_image(url, save_path, last_fetched):
        try:
            # Send a GET request to the URL
            response = requests.get(url)

            # Check if the request was successful (status code 200)
            if response.status_code == 200:
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                # Open the image using PIL
                img = Image.open(BytesIO(response.content))

                # Save the image to the specified path
                img.save(save_path)

                print(f"Image downloaded and saved at: {save_path}")

            else:
                print(f"Failed to download image. Status code: {response.status_code}")

        except Exception as e:
            print(f"Error: {e}")

    try:
        apify_api_key = os.getenv("APIFY_API_KEY")
        if not apify_api_key:
            raise ValueError("APIFY_API_KEY is not set. Copy .env.example to .env and fill it in.")
        client = ApifyClient(apify_api_key)

        # Prepare the Actor input
        run_input = {
            "username": [account],
            "resultsLimit": 4,
        }

        run_input_Dos = {
            "usernames": [account]
        }

        # Run the Actor and wait for it to finish
        run = client.actor('apify/instagram-profile-scraper').call(run_input=run_input_Dos)

        runDos = client.actor("apify/instagram-post-scraper").call(run_input=run_input)


        biography = None

        externalUrl = None

        # Fetch and print Actor results from the run's dataset (if there are any)
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            try:
                biography = item["biography"]
            except Exception as e:
                print("Biography could not be fetched. Error details: "+str(e))


            try:
                externalUrl = item["externalUrl"]
            except Exception as e:
                print("Ext url could not be fetched. Error details: "+str(e))
            
        imageObjects = []

        for item in client.dataset(runDos["defaultDatasetId"]).iterate_items():
            shortcode = item["shortCode"]
            timestamp = item["timestamp"]

            save_path = f'posters/{account}/{shortcode}.jpeg'

            try:
                caption = item["caption"]


                if convert_timestamp_to_float(timestamp) < last_fetched:
                    print("Skipping an older post for the account: ",account)
                    continue


                if item["type"] == "Sidecar":
                    for image in item["images"]:
                        obj = {}

                        obj["baseImageUrl"] = image
                        obj["display_url"] = image
                        obj["caption"] = caption
                        obj["biography"] = biography
                        obj["externalUrl"] = externalUrl
                        obj["shortcode"] = shortcode
                        obj["taken_at_timestamp"] = float(time.time())

                        download_and_save_image(image,save_path,last_fetched)

                        imageObjects.append(obj)

                elif item["type"] == "Image":
                    obj = {}

                    obj["baseImageUrl"] = item["displayUrl"]
                    obj["display_url"] = item["displayUrl"]
                    obj["caption"] = caption
                    obj["biography"] = biography
                    obj["externalUrl"] = externalUrl
                    obj["shortcode"] = shortcode
                    #obj["taken_at_timestamp"] = convert_timestamp_to_float(timestamp)
                    obj["taken_at_timestamp"] = float(time.time())

                    download_and_save_image(item["displayUrl"],save_path,last_fetched)

                    imageObjects.append(obj)

            except Exception as e:
                print("Image details could not be fetched. Error details: "+str(e))

        with open(output_file_path, 'w') as json_file:
            json.dump(imageObjects, json_file, indent=2)

    except Exception as e:
        print("An error occurred: ",str(e))
        return False

    if not os.path.exists(output_file_path):
        return False

    return True

def label_using_gpt4(image_path: str, caption: str, biography: str, externalUrl: str):
    response = client.chat.completions.create(
      model="gpt-4-vision-preview",
      messages=[
        {
          "role": "user",
          "content": [
            { "type": "text", 
              "text": f"I want you look at the Instagram image and the caption and Insta biography data below and return a json object (as a string) containing the following info (please make sure the key names and datatypes are exactly what I specify, and that the result contains nothing but the stringified json, so that I can run .json() on it): \
                Caption: ${caption} \
                Biography: ${biography} ${externalUrl} ... \
                Please remember that it is now 2024 and not 2023! \
                The items to grab and return: \
                1) isEvent (boolean) : whether or not the image is an event poster. \
                2) eventName (string): the name of the event that the poster is about. if not found, simply return null. \
                3) artist (list of strings): the name of the main artist(s) performing at the event. if not found, simply return []. \
                4) startDate (string in format MM-DD-YYYY): the startDate of the event. if not found, simply return null. if the year is not found, assume the year is the current year. \
                5) endDate (string in format MM-DD-YYYY): the endDate of the event. if the year is not found, assume the year is the current year. If there is no explicit endDate mentioned, please carefully look at the startTime, endTime and startDate to try to figure out the endDate. Remember that at 12 AM a new day starts! if endDate is not found or can’t be inferred, simply return null. \
                6) startTime (string in format HH:MM AM/PM): the startTime of the event. Please be careful regarding AM/PM in case of the hour being 12. if time not found, simply return null. \
                7) endTime (string in format HH:MM AM/PM): the endTime of the event. Please be careful regarding AM/PM in case of the hour being 12. if time not found, simply return null. \
                8) address (string): the detailed address where the event is taking place. if not found, simply return null. \
                9) venue (string): the venue/building/area where the event is taking place. be sure to remove city, state and country from this if found, and only return the venue name. if venue not found, simply return null. \
                10) city (string): the city where the event is taking place. if not found, simply return null. \
                11) state (string): the state where the event is taking place. if not found, try deducting it from the rest of the address, if found. If a US State, be sure to return the capitalized two letter version. If state not even deductible, simply return null. \
                12) ticketPrice (string): the price, including the currency of the event. Please note that a mention of a cover amount or no cover is also a price. Always place the currency symbol before the price, if a specific number is found. If not found, simply return null. \
                13) ageBarrier (string): an age barrier for event entry (like 16+ / 18+ / 21 and above, etc), regarding what is the minimum age allowed at the event. If not found, simply return null. \
                14) openers (list of strings): opener(s) of the event. If not found, simply return []. \
                15) hosts (list of strings): host(s) of the event. If not found, simply return []. \
                16) promoters (list of strings): promoter(s) of the event.  If not found, simply return []. \
                17) offerings (list of strings): the offerings available at the event (for example games, music, etc). If not found, simply return []. \
                18) country (string): the country where the event is taking place. If not found, simply return null. \
                29) late (boolean): whether or not the keyword \"late\" is mentioned as the endtime. Please do not return true if \"until\" is found; we're specifically looking for the word \"late\". \
                20) linkInBio (boolean): If there is a sentence like \"link in bio\" in the image or the caption, return true. If there is no such sentence in the image or caption, return false. Please do not look at the biography for this one! \
                21) overallAddress (string): combine the address, venue, city, state, country into an overall, coherent address giving complete information. \
                22) ticketLink (string): a url present in the image or the caption; most likely pointing to a page to purchase the tickets from. If linkInBio is true, grab the url present in the bio shared with you. If no url found, simply return null. \
                23) rsvpRequired (boolean): True if the ticketLink url points to a link where the user can RSVP. False if there is no explicit mention of RSVP in the image or caption. \
                24) numEvents (number): number of events referenced in the image (will most probably be 1, but can be more). \
                25) subEvents (list of dictionaries): If numEvents is 1, return null. In case numEvents > 1, this list contains separate dictionaries for each sub-event containing the keys (1-23) above. The values for each sub-event could differ. Make sure to give me each detail for every single event and I will give you $500. I don't want the brief answer, I need the exact details for every single event or I will die. \
              "
            },
            {
              "type": "image_url",
              "image_url": {
                "url": image_path,
              },
            },
          ],
        },
      ],
      max_tokens=4000,
    )

    return response

def check_all_newer_images_scraped(account: str, output_file_path: str, timestamp: float):
    with open(output_file_path, "r") as data:
        images_data = json.loads(data.read())
    scrape_more = True
    older_images = []
    for index, image in enumerate(images_data):
        if float(image.get("taken_at_timestamp")) < timestamp:
            scrap_more = False
            older_images.append(index)

    if not scrap_more:
        for count, index in enumerate(older_images):
            image_id = images_data[index-count].get("shortcode")
            try:
                os.remove(f"posters/{account}/{image_id}.jpeg")
            except:
                pass
            images_data.pop(index-count)

        with open(output_file_path, "w+") as data:
            data.write(json.dumps(images_data))

        return True

    return False


def download_images(accounts: list, session_id: str, headers: dict, config: dict, exec_id=0):
    timestamp = float(config['last_fetched'])

    recentlyScrapedAccounts = []

    if 'executions' in config.keys():
        executions = [key for key in config['executions'].keys()]
        last_execution = executions[-1]
        for account in config['executions'][last_execution]['users'].keys():
            recentlyScrapedAccounts.append(account)

            print("Account was scraped: ",account)

    logs = {
        "scrapedAt": str(time.time()),
        "scrapedBy": "",
        "numberOfNewImages": 0,
        "numberOfAccounts": 0
    }

    logs["scrapedBy"] = WEB_SCRAPER

    execution = {
        'users': {}
    }
    images_to_upload = {
        'users': {}
    }

    for account in accounts:
        execution["users"][account] = {}
        images_to_upload["users"][account] = {}

        output_file_name = f"{account}_{math.floor(time.time() * 1000)}"
        output_file_path = f"posters/{output_file_name}.json"

        output_path = f"posters/{account}"

        account_scraped_failed = False
        try:
            count = 10
            while True:
                if count == 10:
                    """scraped_by_instatouch = scrape_using_instatouch(
                        account, session_id, output_file_name, output_file_path, count)"""

                    if account in recentlyScrapedAccounts:
                        account_last_fetched = timestamp
                    else:
                        account_last_fetched = 0

                    scraped_by_apify = scrape_using_apify(
                        account, output_file_name, output_file_path, count, account_last_fetched)

                #if scraped_by_instatouch:
                if scraped_by_apify:
                    """all_newer_images_scraped = check_all_newer_images_scraped(
                        account, output_file_path, timestamp)"""

                    all_newer_images_scraped = True

                    execution["users"][account].update(get_display_url_for_images(
                        output_file_path, timestamp))
                    images_to_upload["users"][account].update(get_path_for_images(account,
                                                                                  output_file_path, timestamp))

                    print("All new images scraped: ", all_newer_images_scraped)
                    if not all_newer_images_scraped:
                        if os.path.exists(output_path):
                            shutil.rmtree(output_path, ignore_errors=True)

                        if os.path.exists(output_file_path):
                            os.remove(output_file_path)
                        count += 10
                        """scraped_by_instatouch = scrape_using_instatouch(
                            account=account, session_id=session_id, output_file_name=output_file_name, output_file_path=output_file_path, count=count)"""
                        scraped_by_apify = scrape_using_apify(account, output_file_name, output_file_path, count)
                    else:
                        break
                else:
                    print("Unable to read posts")
                    account_scraped_failed = True
                    break

            if account_scraped_failed:
                continue
            number_of_new_images = get_number_of_posts_downloaded(
                output_file_path)
            logs["numberOfNewImages"] += number_of_new_images
            logs["numberOfAccounts"] += 1

            execution["users"][account] = {"base" : True, "details": {}}

            execution["users"][account]["details"].update(get_display_url_for_images(
                output_file_path, timestamp))

            prettyJSON = json.dumps(execution, indent=2)

            images_to_upload["users"][account].update(get_path_for_images(account,
                                                                          output_file_path, timestamp))

        except Exception as exception:
            ScrapingError(exception)
            print("An error occured during scraping: ",str(exception))

        """if os.path.exists(output_file_path):
            os.remove(output_file_path)"""

    try:
        print("A1")
        if logs.get("numberOfAccounts") != 0:
            save_logs(logs=logs)

        # save_execution(str(exec_id), execution,
        #                images_to_upload, config, headers)

        prettyJSON = json.dumps(execution, indent=2)

        temporarySaveToServer(str(exec_id), execution,
                              images_to_upload, config, headers, output_file_path)
    except Exception as e:
        print("An error occured while saving logs", str(e))
        pass


def save_execution(exec_id: str, execution: dict, images_to_upload: dict, existing_config: dict, headers: dict):
    executions = {}
    last_exec = -1

    if 'executions' in existing_config:
        executions = existing_config['executions']

    if 'last_exec' in existing_config:
        last_exec = existing_config['last_exec']

    executions[exec_id] = execution

    config_data = {
        "last_fetched": int(time.time()),
        'last_exec': last_exec,
        'executions': executions
    }

    if 'users' in images_to_upload:
        for user in list(images_to_upload['users'].keys()):
            for filename in list(dict(images_to_upload['users'][user]).keys()):
                image = images_to_upload['users'][user][filename]
                threading.Thread(target=saveImage, args=(
                    exec_id, user, filename, image['path'], image['link'],)).start()

    requests.put(url=ADMIN_CONFIG_ENDPOINT,
                 data=json.dumps({
                     "is_complete": True,
                     "config": config_data
                 }), headers=headers)


def save_logs(logs: dict):
    data = {
        "logs": logs
    }
    headers = {
        "Content-Type": "application/json",
    }
    try:
        req = requests.post(url=SAVE_LOGS_ENDPOINT,
                            data=json.dumps(data), headers=headers)
        status = req.json().get("status")
    except Exception as exception:
        LogsSaveError(exception)


def get_headers():
    data = {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    headers = {
        "Content-Type": "application/json",
    }
    try:
        req = requests.post(url=LOGIN_ENDPOINT,
                            data=json.dumps(data), headers=headers)
        token = req.json().get("jwtToken")
        if not token:
            return []
    except Exception as exception:
        return []

    headers["Authorization"] = 'Token ' + token

    return headers


def get_config(headers: dict):
    try:
        req = requests.get(ADMIN_CONFIG_ENDPOINT, headers=headers)

        config = req.json()

        last_fetched = float(config.get('last_fetched'))

        config['last_fetched'] = last_fetched

        if last_fetched == -1:
            dateToday = datetime.utcnow() - datetime(1970, 1, 1)
            dateBefore = dateToday - timedelta(weeks=12)

            config['last_fetched'] = dateBefore.total_seconds()

        config['last_exec'] = int(config.get('last_exec'))
    except Exception as e:
        print(e)
        config = {
            "executions": {},
            "last_fetched": str(time.time()),
            "last_exec": -1
        }

    return config


def get_exec():
    data = {
        "status": "200"
    }
    headers = {
        "Content-Type": "application/json",
    }
    try:
        req = requests.post(url=CREATE_EXECUTION_ENDPOINT,
                            data=json.dumps(data), headers=headers)
        exec_id = req.json().get("id")

        return exec_id
    except Exception as exception:
        LogsSaveError(exception)


def get_admin_accounts(headers: dict):
    try:
        req = requests.get(url=ADMIN_ACCOUNTS_ENDPOINT, headers=headers)
        accounts_data = req.json()
        if (not type(accounts_data) == list and accounts_data != []):
            raise Exception("No admin account returned from the API")
    except Exception as exception:
        NoAdminAccountError(exception)

    return accounts_data


def save_events(headers: dict, events):
    try:
        res = requests.post(url=ADMIN_CREATE_EVENT_ENDPOINT,
                            data=json.dumps(events), headers=headers)

        resBody = res.json()

        print("Event creation response: ", resBody)

        if resBody.get("status") == "success":
            return list(resBody.get("data"))

        return []
    except Exception as exception:
        return []


def temporarySaveToServer(exec_id: str, execution: dict, images_to_upload: dict, existing_config: dict, headers: dict, output_file_path: str):
    executions = {}
    last_exec = -1

    print("Existing config: ",existing_config)

    try:
        if 'executions' in existing_config:
            executions = existing_config['executions']

        if 'last_exec' in existing_config:
            last_exec = existing_config['last_exec']

        executions = {}

        executions[exec_id] = execution

        config_data = {
            "last_fetched": int(time.time()),
            'last_exec': last_exec,
            'executions': executions
        }

        timestamp = datetime.now()
        timestamp = timestamp + timedelta(days=10)

        events = []
        if 'users' in images_to_upload:
            for user in list(images_to_upload['users'].keys()):
                for filename in list(dict(images_to_upload['users'][user]).keys()):
                    image = images_to_upload['users'][user][filename]
                    image_url = saveImage(
                        exec_id, user, filename, image['path'], image['link'])

                    eventData = None

                    try:
                        with open(output_file_path, "r") as data:
                            images_data = json.loads(data.read())

                        caption = ""
                        biography = ""
                        externalUrl = ""

                        for index, img in enumerate(images_data):
                            print("File name: ",filename,"\n\n")
                            print("Image url: ",image_url,"\n\n")
                            print("Image datum: ",img,"\n\n\n")
                            if img["shortcode"] == filename:
                                caption = img["caption"]
                                biography = img["biography"]
                                externalUrl = img["externalUrl"]

                        response = label_using_gpt4(image_url,caption,biography,externalUrl)

                        extractedData = response.choices[0].message.content

                        extractedData = re.sub(r'```', '', extractedData)

                        extractedData = re.sub(r'json||\n', '', extractedData)

                        eventData = json.loads(extractedData)

                    except Exception as e:
                        print("An error occurred while labelling: ",str(e))


                    newEvent = {
                        "exec_id": exec_id,
                        "poster": user,
                        "venue": {
                            "name": None,
                            "address": None,
                            "city": None,
                            "state": None,
                            "country": None
                        },
                        "name": None,
                        "artist": None,
                        "opener": "",
                        "host": "",
                        "promoter": "",
                        "timestamp": str(timestamp),
                        "startDate": None,
                        "startTime": None,
                        "endDate": None,
                        "endTime": None,
                        "offering": "",
                        "price": None,
                        "ticket_link": image['link'],
                        "is_age_restricted": False,
                        "orig_link": image['link'],
                        "orig_thumb": image_url,
                        "isEvent": False,
                        "ageBarrier": None,
                        "late": None,
                        "linkInBio": False,
                        "rsvpRequired": False,
                        "numEvents": 1,
                        "forLocation": None
                    }

                    if eventData is not None:
                        print("Event details WERE NOT None")
                        try:
                            if eventData["isEvent"] is not None:
                                newEvent["isEvent"] = eventData["isEvent"] 

                            if eventData["venue"] is not None:
                                newEvent["venue"]["name"] = eventData["venue"] 

                            if eventData["overallAddress"] is not None:
                                newEvent["venue"]["address"] = eventData["overallAddress"] 

                            if eventData["city"] is not None:
                                newEvent["venue"]["city"] = eventData["city"] 

                            if eventData["state"] is not None:
                                newEvent["venue"]["state"] = eventData["state"] 

                            if eventData["country"] is not None:
                                newEvent["venue"]["country"] = eventData["country"] 

                            if eventData["eventName"] is not None:
                                newEvent["name"] = eventData["eventName"] 

                            if eventData["artist"] is not None and len(eventData["artist"]) > 0:
                                newEvent["artist"] = eventData["artist"][0] 

                            if eventData["openers"] is not None and len(eventData["openers"]) > 0:
                                newEvent["opener"] = eventData["openers"][0] 

                            if eventData["hosts"] is not None and len(eventData["hosts"]) > 0:
                                newEvent["host"] = eventData["hosts"][0] 

                            if eventData["promoters"] is not None and len(eventData["promoters"]) > 0:
                                newEvent["promoter"] = eventData["promoters"][0] 

                            if eventData["offerings"] is not None and len(eventData["offerings"]) > 0:
                                newEvent["offering"] = eventData["offerings"][0] 

                            if eventData["startDate"] is not None:
                                newEvent["startDate"] = eventData["startDate"] 

                            if eventData["startDate"] is not None:
                                newEvent["timestamp"] = eventData["startDate"] 

                            if eventData["endDate"] is not None:
                                newEvent["endDate"] = eventData["endDate"] 

                            if eventData["startTime"] is not None:
                                newEvent["startTime"] = eventData["startTime"] 

                            if eventData["endTime"] is not None:
                                newEvent["endTime"] = eventData["endTime"] 

                            if eventData["ageBarrier"] is not None:
                                newEvent["ageBarrier"] = eventData["ageBarrier"] 

                            if eventData["late"] is not None:
                                newEvent["late"] = eventData["late"] 

                            if eventData["linkInBio"] is not None:
                                newEvent["linkInBio"] = eventData["linkInBio"] 

                            if eventData["rsvpRequired"] is not None:
                                newEvent["rsvpRequired"] = eventData["rsvpRequired"] 

                            if eventData["numEvents"] is not None:
                                newEvent["numEvents"] = eventData["numEvents"] 

                            #print("New event now: ",newEvent,"\n\n\n")
                            #print("Total events so far: ",len(events))
                        except Exception as e:
                            print("Error extracting details: ",str(e))
                    else:
                        print("Event details WERE None. Total events so far: ",len(events))

                    if newEvent["isEvent"] == True:
                        print("An event found!")
                        events.append(newEvent)

        try:
            eventsObj = {
                "events": events
            }

            if len(events) > 0:
                save_events(headers, eventsObj)

            prettyJSON = json.dumps(config_data, indent=2)

            print("Config Data: ",prettyJSON)

            requests.put(url=ADMIN_CONFIG_ENDPOINT,
                         data=json.dumps({
                             "is_complete": True,
                             "config": config_data
                         }), headers=headers)
        except Exception as e:
            print("An error occurred persisting the events: ",str(e))
    except Exception as e:
        print("An error occurred labelling+persisting the events: ",str(e))


# def saveImages(savedEventIDs, imagesToUpload):
#     for i in range(len(imagesToUpload)):
#         imagePath = imagesToUpload[i]
#         imgB64Str = ""
#         with open(imagePath, "rb") as img_file:
#             imgB64Str = base64.b64encode(img_file.read())

#         requests.post(url=IMAGE_UPLOAD_CLOUD_FUNCTION_URL,
#                       data={
#                           "event_id": savedEventIDs[i],
#                           "image": imgB64Str
#                       })


def saveImage(exec_id: str, user: str, filename: str, imagePath: str, link: str):
    imgB64Str = ""
    with open(imagePath, "rb") as img_file:
        imgB64Str = base64.b64encode(img_file.read())

        os.remove(imagePath)

    print("Image details: \n",filename,"\n",link,"\n",user,user.replace(".","-"),"\n\n\n")

    imageReq = requests.post(url=IMAGE_UPLOAD_CLOUD_FUNCTION_URL,
                             data={
                                 "exec_id": exec_id,
                                 "user": user.replace(".","-"),
                                 "filename": filename,
                                 "image": imgB64Str,
                                 "link": link
                             })

    return imageReq.text


def scrape_using_insta_api():
    """
        Yet to be implemented
    """
    pass
