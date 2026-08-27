Insta-Scraper is made to scrape the images from Instagram accounts.

Requiremenst: 
    - Python 3.10.8 and above
    - Install requirements from requirements.txt file
    - The script requires a node package instatouch to run, you can download/install instatouch here - https://github.com/drawrowfly/instagram-scraper.

Command:
    - python insta_scraper.py

Details:
    - The scraper allows you to scrape images that are posted by the user after the provided timestamp.
    - It will download and save those images locally.
    - The scraper uses the session id which is created by logging in to the Instagram account.
    - Providing session id and ds user id allows us to scrape data without any MaxListenersExceededWarning.
