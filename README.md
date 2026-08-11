# Event Tracker

Event Tracker is a web application that keeps track of events publicized over Instagram on selected accounts and provides a convenient way to view all of them. The dashboard allows for efficient searching and filtering of events in order to find the event most ideal for the user.
It uses a scraper in the backend to periodically scrape event posts on Instagram and then uses a machine-learning model to get the information from it.

## Sub-Component(s) in this Repository

#### REST API

The REST API is the bridge between the Frontend (Main and Admin Dashboard) and the Database and other services. It abstracts the implementation behind specific HTTP endpoints which take in input certain parameters and return a structured response as required. Django has been used for developing the REST API.

#### Image Scraper

The Image Scraper is responsible for scraping instagram posts from the specified accounts. This is performed on a periodic basis. The events are scraped and the images are saved to Firebase Storage using Firebase Cloud Functions.

### Machine-Learning (ML) Script

The Machine-learning Script is responsible for extracting the event information from the images. The ML script runs after scraper is executed.

### REST API Documentation Link: http://18.220.2.91/v1/documentation/

### Image Scraper & ML Script Documentation Link: https://steed-solutions.github.io/Documentation-EventTracker/

### Start Contributing

Please perform the following steps to start contributing to the project:

1. Clone the project locally.
2. Move into the relevant platform directory.
3. Execute the following command: **npm install**
4. To start the application on port 3000 (default), execute the following command: **npm run start**

### Recommended Versions

Please ensure that you have at least the following versions of the technologies required, before starting development:

1. Docker: 4._._
2. Python: 3.9 +
3. Node.js: 16._._ +

---

### Instructions To Update The Repository

1. Ensure that you have write privilege to the repository.
2. Clone the repository.
3. Create a new branch for the required update.
4. Push to the repo when done with the update locally.
5. Create a Pull Request once the new branch has been pushed to the remote repository.
