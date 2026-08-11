# Event Tracker

Event Tracker is a web application that keeps track of events publicized over Instagram on selected accounts and provides a convenient way to view all of them. The dashboard allows for efficient searching and filtering of events in order to find the event most ideal for the user.
It uses a scraper in the backend to periodically scrape event posts on Instagram and then uses a machine-learning model to get the information from it.

## Sub-Component(s) in this Repository

#### Main Dashboard

The Main Dashboard is responsible for viewing all the events that have been scraped from Instagram. The events can be searched for and filtered from the available list of events. Each event has further details which can be viewed by clicking on an event card. The event can be shared with other people by means of copying the link from the event details dialog box. Moreover, the user can also provide feedback against erroneous events.

#### Admin Dashboard

The Admin Dashboard is responsible for managing accounts and events that are currently present in the database. The accounts are the instagram users from which event posts are being scraped from. Furthermore, existing events can be edited directly from the table and the dialog box. The Admin can also review the feedback provided by the user, and set the preferences for the scraper from the admin dashboard.

### Documentation Link: https://steed-solutions.github.io/Documentation-EventTracker/

### Start Contributing

Please perform the following steps to start contributing to the project:

1. Clone the project locally.
2. Move into the relevant platform directory.
3. Execute the following command: **npm install**
4. To start the application on port 3000 (default), execute the following command: **npm run start**

### Recommended Versions

Please ensure that you have at least the following versions of the technologies required, before starting development:

1. npm: 7._._
2. Node.js: 16._._

---

### Instructions To Update The Repository

1. Ensure that you have write privilege to the repository.
2. Clone the repository.
3. Create a new branch for the required update.
4. Push to the repo when done with the update locally.
5. Create a Pull Request once the new branch has been pushed to the remote repository.
