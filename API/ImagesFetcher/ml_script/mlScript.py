import json
import spacy
import time as t
from dateutil import parser
import re
import geonamescache
import matplotlib.pyplot as plt
import os
import pandas as pd
import numpy as np
import cv2
from spacy import displacy
import easyocr
import keras_ocr

import requests
from datetime import datetime, timedelta

path_to_labelled_data = 'labels/Labelled Event Posters - Sheet1.csv'
path_to_posters = 'posters'

ADMIN_EMAIL = "dummy_@gmail.com"
ADMIN_PASSWORD = "dummy_"
LOGIN_ENDPOINT = "http://18.220.2.91/v1/auth/login/"
ADMIN_CREATE_EVENT_ENDPOINT = "http://18.220.2.91/v1/admin/event/"
ADMIN_CONFIG_ENDPOINT = "http://18.220.2.91/v1/admin/config/"


def lambda_handler(e, context):
    headers = {
        "Content-Type": "application/json",
    }
    try:
        req = requests.post(url=LOGIN_ENDPOINT,
                            data=json.dumps({
                                "email": ADMIN_EMAIL,
                                "password": ADMIN_PASSWORD
                            }), headers=headers)
        token = req.json().get("jwtToken")
        if not token:
            raise Exception("API returned no token")
    except Exception as exception:
        pass

    headers["Authorization"] = token

    config = {}

    try:
        req = requests.get(ADMIN_CONFIG_ENDPOINT, headers=headers)

        config = req.json()
    except:
        raise Exception("API returned no config")

    last_extracted_exec = int(config['last_exec'])

    if not 'executions' in config:
        raise Exception("No executions found")

    executions = config['executions']

    if 'default' in executions:
        del executions['default']

    if not os.path.exists(path_to_posters):
        os.makedirs(path_to_posters)

    execution_ids = list(dict(executions).keys())
    for execution_id in execution_ids:
        accounts = list(executions[execution_id]['users'].keys())
        for account in accounts:
            fileNames = list(executions[execution_id]['users'][account].keys())
            for fileName in fileNames:
                url = executions[execution_id]['users'][account][fileName]['image_url']

                if not os.path.exists(f"{path_to_posters}/{account}"):
                    os.makedirs(f"{path_to_posters}/{account}")

                try:
                    response = requests.get(url)
                    if response.status_code == 200:
                        file_path = f"{path_to_posters}/{account}/{fileName}.jpeg"
                        with open(file_path, 'wb') as f:
                            f.write(response.content)
                except Exception as e:
                    print(e)

    pipeline = keras_ocr.pipeline.Pipeline(scale=3)

    reader = easyocr.Reader(['en'])

    nlp = spacy.load("en_core_web_sm")  # loading the model

    # Helper code for distinguishing between countries, states, and cities using Geonamescache
    gc = geonamescache.GeonamesCache()

    # gets nested dictionary for countries
    cities = gc.get_cities()

    # gets nested dictionary for US states
    states = gc.get_us_states()
    states_codes = gc.get_us_states()

    def gen_dict_extract(var, key):
        if isinstance(var, dict):
            for k, v in var.items():
                if k == key:
                    yield v
                if isinstance(v, (dict, list)):
                    yield from gen_dict_extract(v, key)
        elif isinstance(var, list):
            for d in var:
                yield from gen_dict_extract(d, key)

    # we get comprehensive lists of all available cities and US states for custom entity tagging later on
    cities = [*gen_dict_extract(cities, 'name')]
    states = [*gen_dict_extract(states, 'name')]
    state_codes = [*gen_dict_extract(states_codes, 'code')]

    # Defining list of labels that we're interested in (exluding "Entities" labels, which will be dealt with seperately)
    bold_labels = [
        "Date",
        "Time",
        "Offerings",
        "Address",
        "Ticket Link",
        "Ticket Price",
        "All ages", "21+"]

    # Defining function that fetches text from event posters using keras-ocr
    seen = []

    def save_events(events):
        print(events)
        try:
            req = requests.post(url=ADMIN_CREATE_EVENT_ENDPOINT,
                                data=json.dumps({"events": events}), headers=headers)

            print(req.status_code)
        except Exception as exception:
            return False

        return True

    def textFromPoster(imgPath):
        text_coords_dict = dict()
        captured_txt = ""
        line_tracker = []

        img = cv2.imread(os.path.join(imgPath))
        imgGray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # temp saving grayscaled image to current working dir
        cv2.imwrite(os.path.join(os.getcwd(), "gray_img.jpeg"), imgGray)

        # applying keras ocr on grayscaled image for more accurate text extraction
        imgs = [keras_ocr.tools.read(
            os.path.join(os.getcwd(), "gray_img.jpeg"))]
        prediction_groups = pipeline.recognize(imgs)
        pred_img = prediction_groups[0]

        list_of_sub_imgs = []
        max_size = 0
        event_name_txt = ""
        for txt, boxes in pred_img:

            # cropping out the text subimage based on bounding box coords
            crop_img = img[int(boxes[0][1]):int(boxes[2][1]),
                           int(boxes[0][0]):int(boxes[1][0])]
            list_of_sub_imgs.append(crop_img)

            # this code block to compute areas of each bounding box and find the largest area
            # that gives us the text with largest font size
            img_area = int(crop_img.shape[0]) * int(crop_img.shape[1])
            try:
                if img_area > max_size:
                    if len(txt) > 3:
                        max_size = img_area

                        event_name_txt = txt
            except:
                pass

            if len(line_tracker) == 0 or line_tracker[-1] == str(boxes[2][1]):
                # continuing our line, continuing to add words to it, as long as y-coordinate remains the same
                line_tracker.append(str(boxes[2][1]))
                captured_txt += txt
                captured_txt += " "

            else:
                # if new y-coordinate value encountered, that means new line has begun
                captured_txt += "\n"
                captured_txt += txt

                # reset array to process next line
                line_tracker = []
                line_tracker.append(str(boxes[2][1]))

        # appending captured event name text at the end of our whole text body
        captured_txt += "\n"
        captured_txt += event_name_txt

        # removing grayscaled version now that our task is done
        os.remove(os.path.join(os.getcwd(), "gray_img.jpeg"))
        return captured_txt.lower()

    execution_paths = {}
    execution_ids = list(dict(executions).keys())
    if len(execution_ids) > 0 and last_extracted_exec < int(execution_ids[-1]):
        last_extracted_exec_index = 0
        for i in range(len(execution_ids)):
            execution_id = int(execution_ids[i])
            if execution_id > last_extracted_exec:
                last_extracted_exec_index = i
                break

        for execution_id in execution_ids[last_extracted_exec_index:]:
            paths = []
            accounts = list(executions[execution_id]['users'].keys())
            for account in accounts:
                fileNames = executions[execution_id]['users'][account].keys()
                for fileName in fileNames:
                    paths.append(
                        f"{path_to_posters}/{account}/{fileName}.jpeg")
            execution_paths[execution_id] = paths

        for exec_id in list(execution_paths.keys()):
            execution = execution_paths[exec_id]
            for img in execution:
                # check if file has valid extension
                if str(img).find('.jpeg') != -1 and os.path.isfile(img):
                    # calling the text from image function
                    captured_text = textFromPoster(str(img))

                    # writing the extracted to text file in order to persist it for next section (and rapid testing purposes)
                    with open(str(img).replace('.jpeg', '.txt'), 'w') as f:
                        f.write(captured_text)

    # Loading csv file in dataframe and visualizing it
    pd.set_option('display.max_rows', None)

    # reading the labelled data csv file into datafram
    events_df = pd.read_csv(path_to_labelled_data, encoding="ISO-8859-1")

    # for uniformity, to make sure all "NaN" cells in dataframe are simply "-"
    events_df = events_df.fillna("-")

    # Using SpaCy's NER capabilities for Labels A-E
    images_with_label = 0
    index = 0

    # maintaining count of entity fields, which include (for v1 at least) artist, with / opener, event name, host, and promoter
    entity_count = 0

    # maintaining count of images that contain entity fields
    entity_imgs = 0

    # dict of image name:entity values, to be used later in the code as well
    global_dict = dict()

    # for each text file associated with event poster
    text_file_to_exec_id = {}
    for exec_id in list(execution_paths.keys()):
        text_files = [str(imgPath).replace('.jpeg', '.txt')
                      for imgPath in execution_paths[exec_id]]

        for txt_file in text_files:
            poster_txt = ""
            # variables to be used for spacy entity extraction
            entities = []
            labels = []

            # check if file has valid extension
            if str(txt_file).find('.txt') != -1 and os.path.isfile(txt_file):
                # reading in each event poster's text into the poster_txt variable
                with open(txt_file, 'r') as file:
                    poster_txt = file.read()

            text_file_to_exec_id[txt_file] = exec_id

            poster_txt = poster_txt.replace("\n", " ")
            # print(poster_txt)

            # running the spacy model on the captured text
            doc = nlp(poster_txt)

            # if entity labels we are looking for are even present in the image

            if str(events_df["Event Name"][index]) != "-" or str(events_df["Artist"][index]) != "-" or str(events_df["with / opener"][index]) != "-" or str(events_df["Host"][index]) != "-" or str(events_df["Promoter"][index]) != "-":
                images_with_label += 1

                # for each entity extracted from doc, see if we can find a match in any of the A-E labels
                for ent in doc.ents:

                    # print(str(ent))

                    # see if the entity is present in at least one of the A-E label fields
                    # if str(ent).replace(",", " ").lower() in events_df["Artist"][index].lower() or str(ent).replace(",", " ").lower() in events_df["with / opener"][index].lower() or str(ent).replace(",", " ").lower() in events_df["Event Name"][index].lower() or str(ent).replace(",", " ").lower() in events_df["Promoter"][index].lower() or str(ent).replace(",", " ").lower() in events_df["Host"][index].lower():

                    entities.append(str(ent).replace(",", " "))
                    labels.append("Entities")
                    entity_count += 1

                    # conversely, see if one of the A-E label fields is present in extracted entity,
                    # as the latter could have a couple extra or so characters
                    # elif events_df["Artist"][index].lower() in str(ent).replace(",", " ").lower() or events_df["with / opener"][index].lower() in str(ent).replace(",", " ").lower() or events_df["Event Name"][index].lower() in str(ent).replace(",", " ").lower() or events_df["Promoter"][index].lower() in str(ent).replace(",", " ").lower()  or events_df["Host"][index].lower() in str(ent).replace(",", " ").lower():

                    entities.append(str(ent).replace(",", " "))
                    labels.append("Entities")
                    entity_count += 1

                    # else:
                    # note: this one applies to Promoter and Host fields:
                    # as last resort, split captured text into tokens or words,
                    # and see if those are either of an Promoter type or Host/Venue type based on keyword-matching
                    # and then if they are, check if they exist in the csv field labels as well

                    for word in poster_txt.split("\n"):

                        # terms commonly found in host/venue type fields
                        host_venue_tokens_list = ["club", "bar", "lake", "waterfront", "amphitheatre", "course",
                                                  "resort", "park", "hotel", "lounge", "auditorium", "theatre", "school", "studio"]
                        promoter_tokens_list = [
                            "company", "co.", "management", "club", "events", "productions"]
                        if word in host_venue_tokens_list or any(h in word for h in host_venue_tokens_list):

                            if word in events_df["Host"][index].lower():
                                entities.append(word)
                                labels.append("Entities")
                                entity_count += 1

                        # terms commonly found in Promoter type fields, as promoters are usually organizations

                        elif word in promoter_tokens_list or any(p in word for p in promoter_tokens_list):

                            if word in events_df["Promoter"][index].lower():
                                entities.append(word)
                                labels.append("Entities")
                                entity_count += 1

                # fields against labels table
                ent_df = pd.DataFrame({'Labels': labels, 'Entities': entities})

                for lbl in (set(ent_df['Labels'])):
                    if lbl == "Entities":
                        global_dict[str(txt_file)] = list(
                            ent for ent in (set(entities)))

                if len(set(ent_df['Labels'])) == 0:
                    global_dict[str(txt_file)] = []

                # print("Moving on to next image....\n\n\n")
                index += 1

            else:
                print("Next image as this one doesn't have the required field!")
                index += 1
                continue  # continue to next image if current label that we're looking for isn't even in the image

    entity_imgs = images_with_label

    # Heuristic pattern-based approach for the remaining labels
    # for regex matching in our heuristic pattern-based approach
    # this library will help us validate date and time fields
    # this is for maintaining counts of the various fields so that we can calculate accuracy against each later
    all_ages_count = 0
    the_above18_count = 0
    ticket_link_count = 0
    ticket_price_count = 0
    offering_count = 0
    time_count = 0
    date_count = 0
    address_count = 0

    # this is for maintaining counts of the images that contain the specified field
    # so that we can calculate accuracy against each later
    all_ages_imgs = 0
    above18_imgs = 0
    tix_link_imgs = 0
    date_imgs = 0
    time_imgs = 0
    tix_price_imgs = 0
    address_imgs = 0
    offering_imgs = 0

    # the dict that will hold the values
    result_dict = dict()

    allEvents = []
    # for each label in our list of defined labels above
    for bl in bold_labels:
        images_with_label = 0
        index = 0

        # for each text file of event poster text present in the event posters directory
        text_from_easy = ""
        for txt_file in list(text_file_to_exec_id.keys()):

            if str(txt_file).find('.jpeg') != -1:
                text_from_easy = ""
                for boxes, txt, smt3 in reader.readtext(txt_file):
                    text_from_easy += txt
                    text_from_easy += " "
                continue

            free_count = 0
            poster_txt = ""

            tix_link_list = []
            tix_price_list = []
            date_list = []
            time_list = []
            offering_list = []
            address_list = []
            entities_list = []

            # variables to be used for spacy entity extraction
            entities = []
            labels = []

            # variables to hold ticket link, price, offering, time, date, and address (encompassing city, state, venue, address) info
            ticket_url = ""
            ticket_price = ""
            offering = ""
            time = ""
            date = ""

            address = ""

            if str(txt_file).find('.txt') != -1:  # check if file has valid extension of .txt
                with open(txt_file, 'r') as file:
                    poster_txt = file.read()

                # continue to next image if current label that we're looking for isn't even in the image
                if str(events_df[bl][index]) != "-":
                    images_with_label += 1

                else:
                    index += 1
                    continue

                # first four lines most prolly event name info
                line_count = 0
                for line in poster_txt.split("\n"):
                    if len(line) > 3:
                        entities_list.append(line)
                        line_count += 1
                    else:
                        continue
                    if line_count > 3:
                        break

                # print("\nProbably Event Name: " + str(entities_list))

                for line in poster_txt.split("\n"):
                    if len(line) > 3:
                        for ent in nlp(line).ents:
                            if ent.label_ == "PERSON":
                                entities_list.append("\nArtist/with: " + line)
                    else:
                        continue

                # heuristic to determine if all ages (or 21+) are applicable labels in current event image
                if ("kids" in poster_txt or "all ages" in poster_txt):

                    # if field in csv file is also "yes", it's a match
                    if str(events_df["All ages"][index] in "Yes"):

                        if not all_ages_count >= 4 or not the_above18_count >= 4:
                            all_ages_count += 1
                            the_above18_count += 1
                        else:
                            labels.append("All ages")
                            entities.append("Yes")

                            labels.append("21+")
                            entities.append("No")

                # heuristic to determine if 21+ (or all ages) are applicable labels in current event image
                if ("+18" in poster_txt or "18+" in poster_txt or "21+" in poster_txt or "21t" in poster_txt or "t18" in poster_txt or "18t" in poster_txt):

                    print("All ages: N, 21+: Y for " + str(txt_file))

                    # if all_ages_count == 0:
                    if str(events_df["21+"][index] in "Yes"):

                        if not all_ages_count >= 4 or not the_above18_count >= 4:
                            all_ages_count += 1
                            the_above18_count += 1

                        else:

                            labels.append("21+")
                            entities.append("Yes")

                            labels.append("All ages")
                            entities.append("No")

                for word in text_from_easy.split(" "):
                    try:
                        if bool(parser.parse(word)):

                            date = word
                            labels.append("Date")
                            entities.append(date.lower())
                            date_list.append(date)

                            # if captured date matches that of the actual date field, we have a match!!
                            if bl == "Date" and (date.lower() in str(events_df["Date"][index]).lower()):

                                date_count += 1

                    except:
                        pass

                    # if captured field is succesfully parsed as a time field by dateutil's parser, then it is a match!!
                    try:

                        if bool(parser.parse(word)):
                            # re.search("pm$",word) or re.search("p.m.$", word)or re.search("a.m.$", word) or re.search("am$", word) or re.search("^[0-9].pm$",word) or re.search("^[0-9].am$",word):

                            time = word
                            labels.append("Time")
                            entities.append(time.lower())
                            time_list.append(time)

                            # if captured time matches that of the actual time field, we have a match!!
                            if (time.lower() in str(events_df["Time"][index]).lower()):

                                time_count += 1

                    except:
                        pass

                # heuristic based pattern matching for ticket link, ticket price, and offering
                for word in poster_txt.split("\n"):

                    # if there is a word ending in com or org or co, or if it starts with @ (most likely a url)

                    if re.search("^www", word) or re.search("com$", word) or re.search("org$", word) or re.search("au$", word) or re.search(".co$", word) or re.search(".uk$", word) or re.search("^@", word):

                        ticket_url = word

                        entities.append(ticket_url)
                        labels.append("Ticket Link")
                        tix_link_list.append(ticket_url)

                        # if the extension (last 3 chars) of captured ticket url matches that of the actual url, we have a match!
                        # if the first 3 chars of captured ticket url matches that of the actual url, we have a match!
                        # if the captured ticket url wholly matches the actual url, we have an obvious match!!

                        if (re.search(str(ticket_url[-3:])+"$", str(events_df["Ticket Link"][index]).lower()) or re.search(str(ticket_url[:3])+"$", str(events_df["Ticket Link"][index]).lower()) or ticket_url in str(events_df["Ticket Link"][index]).lower()):

                            ticket_link_count += 1

                    # if there is a word ending or starting with $ (with the help of this regex) or ending in pounds, cents
                    # or containing the text "free", it is most likely ticket price field

                    if re.search("\$\ ?[+-]?[0-9]{1,3}(?:,?[0-9])*(?:\.[0-9]{1,2})?", word) or re.search("pounds", word) or re.search("^free", word):

                        ticket_price = word

                        entities.append(ticket_price)
                        labels.append("Ticket Price")
                        tix_price_list.append(ticket_price)

                        # if the captured ticket price matches that of the actual price, we have a match!!
                        if bl == "Ticket Price" and (ticket_price in str(events_df["Ticket Price"][index]).lower()) or ticket_price[-2:] in str(events_df["Ticket Price"][index]).lower():

                            if ticket_price == "free" and free_count == 0:  # make sure there is just ONE instance of "free" per image
                                free_count += 1
                                ticket_price_count += 1

                            elif ticket_price != "free":
                                ticket_price_count += 1

                # if there is a word that is in our list of cities, label it Address and check against Address field
                    if (word.title() in cities or "city" in word.lower()):

                        address = word
                        entities.append(address.lower())
                        labels.append("Address")
                        address_list.append(address)

                        # if captured city matches that of the actual city, we have a match!!
                        if address.lower() in str(events_df["Address"][index]).lower():

                            address_count += 1

                # if there is a word that is in our list of states, label it Address and check against Address field
                    if (word.title() in states or "state" in word.lower() or word.upper() in state_codes):

                        address = word
                        labels.append("Address")
                        entities.append(address.lower())
                        address_list.append(address)

                        # if captured city matches that of the actual city, we have a match!!
                        if address.lower() in str(events_df["Address"][index]).lower():

                            address_count += 1

                    # if any of the following terms is present in token, very likely it's a venue or address hence
                    # label it Address and check against Address field
                    venue_tokens_list = ["club", "bar", "lake", "waterfront", "amphitheatre", "hotel", "ave",
                                         "course", "resort", "park", "lounge", "auditorium", "theatre", "school", "studio"]
                    promoter_tokens_list = [
                        "company", "co.", "management", "club", "events", "productions"]

                    if word in venue_tokens_list or any(v in word for v in venue_tokens_list):

                        address = word
                        labels.append("Address")
                        entities.append(address.lower())
                        address_list.append(address)

                        # if captured city matches that of the actual city, we have a match!!
                        if address.lower() in str(events_df["Address"][index]).lower():

                            address_count += 1
                            address_list.append(address)

                    # if the token is either of the following, it is most likely part of offerings!
                    offerings_token_list = ["coolers", "food", "art", "rides", "games", "camping", "dj", "drinks",
                                            "parking", "prizes", "live", "giveaways", "wine", "concert", "beer", "poetry", "bbq", "more"]
                    if word in offerings_token_list or any(o in word for o in offerings_token_list):

                        offering = word
                        labels.append("Offerings")
                        entities.append(offering.lower())
                        offering_list.append(offering)

                        # if captured offering matches that of the actual offering field, we have a match!!
                        if bl == "Offerings" and (offering.lower() in str(events_df["Offerings"][index]).lower()):

                            offering_count += 1

                            offering_list.append(offering)
                    # if the captured field is succesfully parsed as a date by dateutil's parser, then it is a match!

            sifted = set(poster_txt.split("\n"))

            # fields extracted against labels assigned
            if str(txt_file) not in seen:
                print("\n\n--------------------------\nFor Image " + str(txt_file))

                df = pd.DataFrame({'Labels': labels, 'Entities': entities})

                for item in sifted:
                    if re.search("^www", item) or re.search("com$", item) or re.search("org$", item) or re.search("au$", item) or re.search(".co$", item) or re.search("uk$", item) or re.search("^@", item):
                        set(tix_link_list).add(item)

                for lbl in sorted(set(bold_labels)):

                    if lbl == "Address":
                        sifted = sifted - set(address_list)
                        result_dict["venue"] = list((set(address_list)))
                        # print(lbl + " : " + str(list((set(address_list)))))

                        for easy_word in text_from_easy.lower().split(" "):
                            if re.search("\$\ ?[+-]?[0-9]{1,3}(?:,?[0-9])*(?:\.[0-9]{1,2})?", easy_word):
                                set(tix_price_list).add(easy_word)

                        # creating string of sifted list for spacy NER
                        sifted_str = ""

                        for item in sifted:
                            sifted_str += str(item)
                            sifted_str += " "

                        doc_sifted = nlp(sifted_str)

                        for ent in doc_sifted.ents:
                            if ent.label_ == "PERSON" or ent.label_ == "ORGANIZATION":
                                entities_list.append(item)

                        for item in set(sifted):
                            # print(item)

                            if len(item) > 3:

                                # to remove leading and/or trailing whitespace that might have been captured
                                item = str(item)

                                if item in venue_tokens_list or any(h in item for h in venue_tokens_list):
                                    set(entities_list).add(item)
                                    sifted = sifted - set(entities_list)

                                if item in promoter_tokens_list or any(p in item for p in promoter_tokens_list):
                                    set(entities_list).add(item)
                                    sifted = sifted - set(entities_list)

                                if re.search("^www", item) or re.search("com$", item) or re.search("org$", item) or re.search("au$", item) or re.search(".co$", item) or re.search("uk$", item) or re.search("^@", item):

                                    set(tix_link_list).add(item)

                                    sifted = sifted - set(tix_link_list)

                                if item in offerings_token_list or any(o in item for o in offerings_token_list):
                                    set(offering_list).add(item)
                                    sifted = sifted - set(offering_list)
                            """
                            else:
                                # remove items from sifted that are less than 4 characters long (mostly irrelevant/nonsensical items)
                                if item in sifted:
                                    sifted.remove(item)
                            """

                    if lbl == "Date":
                        result_dict["timestamp"] = list((set(date_list)))
                        # print("Date and Time" + " : " + str(list((set(date_list)))))
                        sifted = sifted - set(date_list)

                        for easy_word in text_from_easy.lower().split(" "):
                            if re.search("\$\ ?[+-]?[0-9]{1,3}(?:,?[0-9])*(?:\.[0-9]{1,2})?", easy_word):
                                tix_price_list.append(easy_word)

                        sifted_str = ""

                        for item in sifted:
                            sifted_str += str(item)
                            sifted_str += " "

                        doc_sifted = nlp(sifted_str)

                        for ent in doc_sifted.ents:
                            if ent.label_ == "PERSON" or ent.label_ == "ORGANIZATION":
                                entities_list.append(item)

                        # sifted_str.split(" ")
                        for item in set(sifted):

                            if len(item) > 3:

                                # to remove leading and/or trailing whitespace that might have been captured
                                item = str(item).strip()

                                if item in venue_tokens_list or any(h in item for h in venue_tokens_list):
                                    set(entities_list).add(item)
                                    sifted = sifted - set(entities_list)

                                if item in promoter_tokens_list or any(p in item for p in promoter_tokens_list):
                                    set(entities_list).add(item)
                                    sifted = sifted - set(entities_list)

                                if re.search("^www", item) or re.search("com$", item) or re.search("org$", item) or re.search("au$", item) or re.search(".co$", item) or re.search("uk$", item) or re.search("^@", item):

                                    set(tix_link_list).add(item)
                                    sifted = sifted - set(tix_link_list)

                                if item in offerings_token_list or any(o in item for o in offerings_token_list) or re.search("music$", item) or re.search("^music", item):
                                    set(offering_list).add(item)
                                    sifted = sifted - set(offering_list)
                            """
                            else:
                                # remove items from sifted that are less than 4 characters long (mostly irrelevant/nonsensical items)
                                if item in sifted:
                                    sifted.remove(item)
                        """

                    """if lbl=="Time":
                        print(lbl + " : " + str(list((set(time_list)))))"""

                    result_dict["Event Name"] = poster_txt.split("\n")[-1]
                    result_dict["Entities"] = global_dict[str(txt_file)]

                    if lbl == "Ticket Price":
                        result_dict["price"] = list((set(tix_price_list)))
                        # print(lbl + " : " + str(list((set(tix_price_list)))))
                        sifted = sifted - set(tix_price_list)

                        for easy_word in text_from_easy.lower().split(" "):
                            if re.search("\$\ ?[+-]?[0-9]{1,3}(?:,?[0-9])*(?:\.[0-9]{1,2})?", easy_word):
                                tix_price_list.append(easy_word)

                        sifted_str = ""

                        for item in sifted:
                            sifted_str += str(item)
                            sifted_str += " "

                        doc_sifted = nlp(sifted_str)

                        for ent in doc_sifted.ents:
                            if ent.label_ == "PERSON" or ent.label_ == "ORGANIZATION":
                                entities_list.append(item)

                        for item in set(sifted):

                            if len(item) > 3:

                                # to remove leading and/or trailing whitespace that might have been captured
                                item = item.strip()

                                if item in venue_tokens_list or any(h in item for h in venue_tokens_list):
                                    set(entities_list).add(item)
                                    sifted = sifted - set(entities_list)

                                if item in promoter_tokens_list or any(p in item for p in promoter_tokens_list):
                                    set(entities_list).add(item)
                                    sifted = sifted - set(entities_list)

                                if re.search("^www", item) or re.search("com$", item) or re.search("org$", item) or re.search("au$", item) or re.search(".co$", item) or re.search("uk$", item) or re.search("^@", item):

                                    set(tix_link_list).add(item)
                                    sifted = sifted - set(tix_link_list)

                                if item in offerings_token_list or any(o in item for o in offerings_token_list):
                                    set(offering_list).add(item)
                                    sifted = sifted - set(offering_list)

                    if lbl == "Ticket Link":
                        result_dict["ticket_link"] = list((set(tix_link_list)))
                        # print(lbl + " : " + str(list((set(tix_link_list)))))
                        sifted = sifted - set(tix_link_list)

                        for easy_word in text_from_easy.lower().split(" "):
                            if re.search("\$\ ?[+-]?[0-9]{1,3}(?:,?[0-9])*(?:\.[0-9]{1,2})?", easy_word):
                                tix_price_list.append(easy_word)

                        sifted_str = ""

                        for item in sifted:
                            sifted_str += str(item)
                            sifted_str += " "

                        doc_sifted = nlp(sifted_str)

                        for ent in doc_sifted.ents:
                            if ent.label_ == "PERSON" or ent.label_ == "ORGANIZATION":
                                entities_list.append(item)

                        for item in set(sifted):

                            if len(item) > 3:

                                # to remove leading and/or trailing whitespace that might have been captured
                                item = item.strip()

                                if item in venue_tokens_list or any(h in item for h in venue_tokens_list):
                                    set(entities_list).add(item)

                                if item in promoter_tokens_list or any(p in item for p in promoter_tokens_list):
                                    set(entities_list).add(item)

                                if re.search("^www", item) or re.search("com$", item) or re.search("org$", item) or re.search("au$", item) or re.search(".co$", item) or re.search("uk$", item) or re.search("^@", item):

                                    set(tix_link_list).add(item)
                                    sifted = sifted - set(tix_link_list)

                                if item in offerings_token_list or any(o in item for o in offerings_token_list):
                                    set(offering_list).add(item)
                                    sifted = sifted - set(offering_list)

                    if lbl == "Offerings":
                        result_dict["offerings"] = list((set(offering_list)))
                        # print(lbl + " : " + str(list((set(offering_list)))))
                        sifted = sifted - set(offering_list)

                        for easy_word in text_from_easy.lower().split(" "):
                            if re.search("\$\ ?[+-]?[0-9]{1,3}(?:,?[0-9])*(?:\.[0-9]{1,2})?", easy_word):
                                tix_price_list.append(easy_word)

                        sifted_str = ""

                        for item in sifted:
                            sifted_str += str(item)
                            sifted_str += " "

                        doc_sifted = nlp(sifted_str)

                        for ent in doc_sifted.ents:
                            if ent.label_ == "PERSON" or ent.label_ == "ORGANIZATION":
                                entities_list.append(item)

                        for item in set(sifted):

                            if len(item) > 3:

                                # to remove leading and/or trailing whitespace that might have been captured
                                item = item.strip()

                                if item in venue_tokens_list or any(h in item for h in venue_tokens_list):
                                    set(entities_list).add(item)

                                if item in promoter_tokens_list or any(p in item for p in promoter_tokens_list):
                                    set(entities_list).add(item)

                                if re.search("^www", item) or re.search("com$", item) or re.search("org$", item) or re.search("au$", item) or re.search(".co$", item) or re.search("uk$", item) or re.search("^@", item):

                                    set(tix_link_list).add(item)
                                    # sifted = sifted - set(tix_link_list)

                                if item in offerings_token_list or any(o in item for o in offerings_token_list):
                                    set(offering_list).add(item)
                                    # sifted = sifted - set(offering_list)

                # making a string of entity terms
                entities_str = ""
                temp_set = set()
                for ent in (entities_list):

                    if len(ent) > 3 and ent not in temp_set:
                        temp_set.add(ent)
                        entities_str += str(ent)
                        entities_str += " "
                    else:
                        continue

                sifted = sifted - set(entities_list)

                if ("kids" in poster_txt or "all ages" in poster_txt):
                    result_dict["is_age_restricted"] = False

                elif ("21+" in poster_txt or "18+" in poster_txt):
                    result_dict["is_age_restricted"] = True

                else:
                    result_dict["is_age_restricted"] = False

                venueObject = {
                    "name": "N/A" if len(result_dict['venue']) == 0 else result_dict['venue'][0],
                    "address": "N/A" if len(result_dict['venue']) == 0 else ", ".join(list(result_dict['venue'])),
                    "city": "N/A" if len(result_dict['venue']) < 2 else result_dict['venue'][1],
                    "state": "N/A" if len(result_dict['venue']) < 3 else result_dict['venue'][2],
                    "country": "N/A" if len(result_dict['venue']) < 4 else result_dict['venue'][3],
                }

                txt_file_split = str(txt_file).split("/")

                poster = txt_file_split[1]
                exec_id = text_file_to_exec_id[txt_file]
                fileName = txt_file_split[-1]
                imgName = fileName.split('.')[0]

                currentExecution = executions[exec_id]

                timestamp = datetime.now()
                timestamp = timestamp + timedelta(days=10)

                price = 0
                if len(list(result_dict['price'])) > 0:
                    prices = " ".join(result_dict['price'])
                    extractedPrices = re.findall(
                        r"[-+]?(?:\d*\.*\d+)", prices)

                    if len(extractedPrices) > 0:
                        price = float(extractedPrices[0])

                entities = list(result_dict['Entities'])

                eventObj = {
                    "exec_id": exec_id,
                    "poster": poster,
                    "venue": venueObject,
                    "name": result_dict['Event Name'],
                    "artist": "N/A" if len(entities) == 0 else entities[0],
                    "opener": "N/A" if len(entities) < 2 else entities[1],
                    "host": "N/A" if len(entities) < 3 else entities[2],
                    "promoter": "N/A" if len(entities) < 4 else entities[3],
                    "timestamp": str(timestamp),
                    "offering": ",".join(list(result_dict['offerings'])),
                    "price": price,
                    "ticket_link": currentExecution['users'][poster][imgName]['link'] if len(list(result_dict['ticket_link'])) == 0 else result_dict['ticket_link'][0],
                    "is_age_restricted": result_dict["is_age_restricted"],
                    "orig_link": currentExecution['users'][poster][imgName]['link'],
                    "orig_thumb": currentExecution['users'][poster][imgName]['image_url'],
                }

                allEvents.append({
                    "path": txt_file,
                    "event": eventObj
                })

                index += 1

                seen.append(str(txt_file))

    eventsData = [event['event'] for event in allEvents]

    if save_events(eventsData):
        for event in allEvents:
            txtFilePath = event['path']
            imgPath = txtFilePath.replace(".txt", '.jpeg')

            txtFilePathSplit = str(txtFilePath).split("/")
            account = txtFilePathSplit[1]
            fileName = txtFilePathSplit[-1]
            imgName = fileName.split('.')[0]

            os.remove(txtFilePath)
            os.remove(imgPath)

            currentExecution = executions[event['event']['exec_id']]

            del currentExecution['users'][account][imgName]

            if len(list(currentExecution['users'][account].keys())) == 0:
                del currentExecution['users'][account]

            if len(list(currentExecution['users'].keys())) == 0:
                del executions[event['event']['exec_id']]
            else:
                executions[event['event']['exec_id']] = currentExecution

        last_exec = - \
            1 if len(executions) == 0 else int(list(executions.keys())[0])

        newConfig = {}

        newConfig['last_exec'] = last_exec
        newConfig['executions'] = executions

        config_data = {
            'is_complete': True,
            "config": config
        }

        req = requests.put(ADMIN_CONFIG_ENDPOINT,
                           data=json.dumps(config_data), headers=headers)

    return {
        'statusCode': 200
    }
