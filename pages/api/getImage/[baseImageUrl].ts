export const maxDuration = 10; 
export const dynamic = 'force-dynamic';

import type { NextApiRequest, NextApiResponse } from 'next'
import { writeFileSync } from 'fs';
//import firebase from '../../../firebase';
import { app , storage, getStorage, ref, uploadBytes, getDownloadURL } from '../../../firebase';
//import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import NextCors from 'nextjs-cors';

//const { Configuration, OpenAIApi } = require("openai");

import OpenAI from "openai";

export const config = {
  maxDuration: 10,
};


export default async (req: NextApiRequest, res: NextApiResponse) => {
  await NextCors(req, res, {
      // Options
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      origin: '*',
      //origin: ['https://eventtracker-1c82b.web.app', 'http://localhost:3000'],
      optionsSuccessStatus: 200, 
   });

  try {

    /*const configuration = new Configuration({
      apiKey: "",
    });

    const openai = new OpenAIApi(configuration);*/

    const openai = new OpenAI();

    const { baseImageUrl } = req.query;

    if (typeof baseImageUrl !== 'string') {
      throw new Error('Invalid base image URL');
    }

    const overallComponent = JSON.parse(decodeURIComponent(baseImageUrl));

    const baseImageURL: any = overallComponent.baseImageURL;

    const caption: string = overallComponent.caption;

    const biography: string = overallComponent.biography;

    const externalLink: string = overallComponent.externalLink;

    if (!baseImageURL) {
      return res.status(400).send('error: faulty url');
    }

    // Fetch the image data from the Instagram URL
    const response = await fetch(baseImageURL);

    const imageData = await response.blob();

    const buffer = Buffer.from(await imageData.arrayBuffer());

    const timestamp = Date.now();

    const fileName = `${timestamp}.png`;

    const filePath = `/tmp/${fileName}`;

    const storage = getStorage();

    const storageRef = ref(storage, filePath);

    uploadBytes(storageRef, buffer)
    .then((snapshot) => {
      getDownloadURL(storageRef)
      .then((downloadURL) => {
        openai.chat.completions.create({
          model: "gpt-4-vision-preview",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", 
                  text: `I want you look at the Instagram image and the caption and Insta biography data below and return a json object (as a string) containing the following info (please make sure the key names and datatypes are exactly what I specify, and that the result contains nothing but the stringified json, so that I can run .json() on it):
                    Caption: ${caption}
                    Biography: ${biography} + " " + ${externalLink} + " ..."
                    Please remember that it is now 2024 and not 2023!
                    The items to grab and return: 
                    1) is_event (boolean) : whether or not the image is an event poster. 
                    2) eventName (string): the name of the event that the poster is about. if not found, simply return null. 
                    3) artist (list of strings): the name of the main artist(s) performing at the event. if not found, simply return []. 
                    4) startDate (string in format MM-DD-YYYY): the startDate of the event. if not found, simply return null. if the year is not found, assume the year is the current year. 
                    5) endDate (string in format MM-DD-YYYY): the endDate of the event. if the year is not found, assume the year is the current year. If there is no explicit endDate mentioned, please carefully look at the startTime, endTime and startDate to try to figure out the endDate. Remember that at 12 AM a new day starts! if endDate is not found or can’t be inferred, simply return null.
                    6) startTime (string in format HH:MM AM/PM): the startTime of the event. Please be careful regarding AM/PM in case of the hour being 12. if time not found, simply return null. 
                    7) endTime (string in format HH:MM AM/PM): the endTime of the event. Please be careful regarding AM/PM in case of the hour being 12. if time not found, simply return null. 
                    8) address (string): the detailed address where the event is taking place. if not found, simply return null. 
                    9) venue (string): the venue/building/area where the event is taking place. be sure to remove city, state and country from this if found, and only return the venue name. if venue not found, simply return null. 
                    10) city (string): the city where the event is taking place. if not found, simply return null. 
                    11) state (string): the state where the event is taking place. if not found, try deducting it from the rest of the address, if found. If a US State, be sure to return the capitalized two letter version. If state not even deductible, simply return null. 
                    12) ticketPrice (string): the price, including the currency of the event. Please note that a mention of a cover amount or no cover is also a price. Always place the currency symbol before the price, if a specific number is found. If not found, simply return null. 
                    13) age_barrier (string): an age barrier for event entry (like 16+ / 18+ / 21 and above, etc), regarding what is the minimum age allowed at the event. If not found, simply return null. 
                    14) openers (list of strings): opener(s) of the event. If not found, simply return []. 
                    15) hosts (list of strings): host(s) of the event. If not found, simply return []. 
                    16) promoters (list of strings): promoter(s) of the event.  If not found, simply return []. 
                    17) offerings (list of strings): the offerings available at the event (for example games, music, etc). If not found, simply return [].
                    18) country (string): the country where the event is taking place. If not found, simply return null. 
                    29) late (boolean): whether or not the keyword "late" is mentioned as the endtime. Please do not return true if "until" is found; we're specifically looking for the word "late".
                    20) link_in_bio (boolean): If there is a sentence like "link in bio" in the image or the caption, return true. If there is no such sentence in the image or caption, return false. Please do not look at the biography for this one!
                    21) overallAddress (string): combine the address, venue, city, state, country into an overall, coherent address giving complete information.
                    22) ticketLink (string): a url present in the image or the caption; most likely pointing to a page to purchase the tickets from. If link_in_bio is true, grab the url present in the bio shared with you. If no url found, simply return null. 
                    23) rsvp_required (boolean): True if the ticketLink url points to a link where the user can RSVP. False if there is no explicit mention of RSVP in the image or caption. 
                    24) num_events (number): number of events referenced in the image (will most probably be 1, but can be more).
                    25) subEvents (list of dictionaries): If num_events is 1, return null. In case num_events > 1, this list contains separate dictionaries for each sub-event containing the keys (1-23) above. The values for each sub-event could differ. Make sure to give me each detail for every single event and I will give you $500. I don't want the brief answer, I need the exact details for every single event or I will die.
                  ` 
                },
                {
                  type: "image_url",
                  image_url: {
                    "url": downloadURL,
                  },
                },
              ],
            },
          ],
          max_tokens: 4000,
        })
        .then((response) => {
          res.status(200).json({"imageData": downloadURL, "extractedData": response});
        })
        .catch((error) => {
          res.status(500).json({ error: 'Failed to extract data: ' + error });
        });
      })
      .catch((error) => {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Failed to upload image (1): ' + error });
      });
    })
    .catch((error) => {
      console.error('Error uploading image:', error);
      res.status(500).json({ error: 'Failed to upload image (2): ' + error });
    });

    /*
    25) addresses (list of strings):
    26) startDates (list of strings in format MM-DD-YYYY):
    27) startTimes (list of strings in format HH:MM AM/PM):
    28) endDates (list of strings in format MM-DD-YYYY):
    29) endTimes (list of strings in format HH:MM AM/PM):
    30) artists (list of strings):
    31) eventNames (list of strings):
    */

    //writeFileSync(filePath, buffer);

    // Set the appropriate response headers
    //res.setHeader('Content-Type', response.headers.get('Content-Type'));
    //res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache the image for 1 day

    //const imageURL = URL.createObjectURL(imageData);

    ////console.log("success prior: ",imageData,imageURL)

  } catch (error) {
    console.error('Error fetching image on server :', error);
    res.status(500).json({ error: 'Failed to upload image (3): ' + error });
  }
};
