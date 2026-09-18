# Call script: Lafayette screen share, Saturday 2026-09-19, 12:00

Written for Zain. Read once before the call, keep open during it. Every
step says what to click and what to say. Times assume a 60 minute call.

Before you start, in a private browser window: log out of nothing, just have
these tabs open and nothing else on screen.

- https://lafaslist.com
- https://lafaslist.com/admin/login  (log in with the admin login you already use)
- https://github.com/lafataylor/Eventtracker-FS/pull/5  (duplicates fix)
- https://github.com/lafataylor/Eventtracker-FS/pull/6  (AI assisted development)
- docs/AI-ASSISTED-DEVELOPMENT.md open in VS Code

If the deploy has NOT run yet when the call starts, skip nothing: the
walkthrough works on the old site too. Just say in part 3 "this is going
live right after this call" instead of showing it live.

---

## 0. Opening, 3 minutes

Say: "I want to do three things. Show you how the system works end to end so
it stops being a black box, show you the duplicates fix, and set you up with
the AI assisted development you asked about. Then whatever you want to ask."

Then the honest sentences, once, early: "Two things first. I told you Sunday
the duplicates fix would be live that night, and it was not; that was on my
side. And you were right that the admin got slower this month: the recurring
event handling I added tripled the events list, and that exposed two old slow
spots. All of it went out this morning, and I have the before and after
numbers." Do not over explain. Move on.

---

## 1. The public site, click by click, 10 minutes

**Open https://lafaslist.com**

- Point at the city buttons at the top. Say: "Four cities. Each one is its
  own page." Click **Mexico City**. The address becomes /mexico-city/.
- Scroll slowly. Say: "Every card here came from an Instagram post. Nobody
  typed it in. The picture is the flyer, the title, date, time, venue and
  genre were read off the flyer by the AI."
- Click any card. A details panel opens. Point at the two links at the
  bottom: the Instagram post it came from, and **Ticket Details**. Say:
  "Every event links back to its source. If the AI read something wrong, the
  original is one click away." Close it.
- Click the **List** button near the top. The grid becomes a list. Click
  again to go back.
- Type in **Search**: `techno`. Say: "Search looks at every field: title,
  artists, venue, genre, the Instagram handle. And it tolerates typos." Clear
  it, type `tecno` with the h missing. Same results. Clear it.
- Click **Date**, pick a day this weekend. Say: "A date filter finds the
  event on each night it happens, which matters for the recurring ones."
  Clear the filter. Click **Sort** to show the options, then close it.
- Change the city to **Berlin** and then **Bali** so he sees the same layout
  everywhere. Bali is where his screenshot came from; you will come back to it
  in part 3.

What NOT to click: the heart (favorites) needs a visitor login; skip it.

---

## 2. Behind the site: the admin, 12 minutes

**Open https://lafaslist.com/admin/login**, log in. You land on **Accounts**.

Say the one sentence version: "Every night at 2 pm Pacific the system reads
these Instagram accounts, has the AI read each new flyer, and puts the
results on the site. Then it looks for duplicates, then it deletes anything
more than 30 days past."

Left sidebar, top to bottom. Click each one for 30 seconds:

- **Accounts** (where you are). Say: "These are the accounts it follows,
  grouped by city. Adding one is the **+ Add Accounts** button. An account can
  be paused so it stops being scraped without deleting its events; that is
  how we retired the Oaxaca accounts." (The pause is set behind the scenes
  for now; the status column here always reads Tracking. If he asks for a
  pause button, that is a small job.) Do not add or delete anything.
- **Events**. Say: "This is now an inbox of what is coming up, not a dump.
  Yesterday's events are gone at midnight, hidden duplicates and non-events
  are out, rows with no date never make it in, and a recurring event is ONE
  row with a small 'N dates' badge under its thumbnail; deleting that row
  deletes every date." Point at the columns: Thumbnail, Event Name, Start
  Date, End Date, Start Time. "Anything the AI got wrong can be corrected
  here by clicking the cell." Click **Filter**, set Event Date is 08/21/2026,
  and show Lightning in a Bottle turning up (it did not before). Clear it.
  The **+ New Event** button is "paste an Instagram link and the AI reads it
  on the spot". Numbers: 3,235 rows and 8.5 seconds before; about 1,100 rows
  and about a second after (use the figures from the deploy printout).
- **Users**. Visitors who made an account on the site (for favorites).
- **Runs**. The nightly job's log; it took 7 seconds to open on Friday and
  opens in a blink now. Point at the last run's line: how many posts, how
  many events. **Initiate New Run** starts one by hand; do NOT click it on
  the call (it costs OpenAI and Apify credits and runs for an hour).
- **Duplicates**. Two tabs. **Duplicate pairs** is now GROUPS, exactly what
  he asked for: one section per event the system found more than once, every
  candidate side by side, **Keep this one** under each card, **Keep all** and
  **Delete all** for the group, a checkbox per group with **Keep all of
  each** and **Delete all of each** in the bar, and **Load more** at the
  bottom. Say: "One decision per event instead of one per pair, and a
  decision on one Thursday covers every later Thursday of the same posts,
  which is why you were seeing the same ones again and again." **Previously
  flagged** is everything the system hid on its own, with **Restore to site**
  and **Load more**.
- **Feedback**. Messages visitors sent through the site.
- **Details**. Owner profile fields; skip.
- **Settings**. Point at the retention line: out of sight the day after,
  deleted 30 days after. He approved that.

---

## 3. The duplicates, what was wrong and what changed, 12 minutes

Open his own screenshot if you have it, or go to **Bali** on the site.

Say: "Your screenshot was right, and I want to show you exactly what it was.
Those Attika and Savaya cards are one Instagram post each. It is a monthly
programme flyer. The AI reads it as a recurring event, which is correct, and
the system was turning it into a separate listing for every date it lists.
So the same flyer showed up week after week. Across the whole site, about
two thirds of the cards were repeats of that kind. Not a bug in the reading,
a choice in the display."

Then what changed, three points, no more:

1. "Each post shows once, with its next date. A date search still finds it
   on every night. In the admin, that one row deletes all of its dates."
2. "The pairs at the top of your review page were not duplicates. They were
   a Berlin venue's weekly programme, four different acts on four nights,
   one post. The system now knows a different act on a different night is
   a different event, and those pairs are closed."
3. "The review page also no longer shows you pairs where one side was
   already hidden. You were being asked to compare a real event with a card
   nobody could see."

If the deploy is live: open **Bali**, scroll, show Attika and Savaya once
each. Open **Admin, Events**, find one of them, point at the "N dates" badge.
Open **Admin, Duplicates**, show the top of the queue is real pairs now, and
the count is lower.

If not live yet: show PR #5 in GitHub for ten seconds, say "reviewed, tested,
315 checks green, deploys right after this call", and move on.

His four messages from Friday, each with its answer ready:
- "Events from yesterday still showing": fixed, the list is an inbox now.
- "No start or end date should not make it through": fixed at the source and
  the ones already saved are hidden; the old scraper had that rule, the new
  extraction did not, my miss.
- "Lightning in a Bottle under Today, not found under Aug 21": it was stored
  as a four-week event. Long runs now list on their opening day only, cards
  show "Aug 21 – Sep 18" when a run spans days, and the date filter finds any
  day you ask for.
- "Slower and laggier": three causes, all fixed; show the numbers.

The one thing still on the list, say it before he asks: "Matching the same
flyer re-posted by a different account, cropped or with an overlay, needs
image fingerprinting. That is the next 2 to 3 hours if you want it."

---

## 4. AI assisted development, his question, 12 minutes

Say: "You asked if the backend is set up for AI assisted development. As of
today it is. Four things make a project usable by a tool like Claude Code,
and they are all in."

Open PR #6 in GitHub. Click **Files changed**. Scroll to **AGENTS.md** and say:
"This is the briefing the assistant reads on its own. What the system is, how
it works, the commands, and the rules: never touch the live site, never
commit secrets, never spend credits without asking, always run the tests."

Then open docs/AI-ASSISTED-DEVELOPMENT.md and walk the "First time" section
with him, line by line. Five steps: install Claude Code, get the project, run
one setup command, start the assistant, optionally run the site on his own
machine with a few made up events already in it.

If he wants to see it: in Terminal, in a fresh folder, run
`git clone https://github.com/lafataylor/Eventtracker-FS.git` then
`cd Eventtracker-FS` then `make setup`. It takes about three minutes and
ends with the test results. Then `claude` and type: "explain how a post
becomes an event on the site". Read the answer together.

Say the limits plainly: "He needs a Claude Pro or Max subscription. His
changes go through a pull request that I review and deploy; nothing goes
straight to the site, which is the safety net. It is a good junior developer:
great at explaining and small changes, a draft for me to check on anything
touching the scraper or the database."

His login: he has the admin login now (you sent it separately). Have him log
in at https://lafaslist.com/admin/login while you watch, AFTER the deploy. Two
things were fixed for exactly this moment: the full menu (Accounts, Users,
Runs, Feedback, Details, Settings) used to show only for two hardcoded service
logins, so his would have opened with three tabs; and the email was matched
exactly, so "Makemoremusic@gmail.com" with the capital his phone adds would
have said user not found. Both work now. He should see all ten tabs.

---

## 5. Where things stand and what is next, 5 minutes

Done and live: carousel posts split into their events, search across every
field with typo tolerance, duplicates merged automatically above 95 with a
review page, 30 day cleanup, nightly backups, hourly site check, Oaxaca
accounts retired, admin credentials out of the code, his admin login.

Going live today: one card per recurring series, review page cleanup.

Waiting on him:
- Make the GitHub repository private (his click, in Settings). You will give
  him a deploy key for the server first; without it the nightly deploy path
  breaks. Ask him for ten minutes to do it together.
- Puerto Escondido: 12 events, keep or drop.
- Whether he wants the cross account duplicates merged automatically (2 to 3 h).

Hours: do not bring them up. If he does: "The six I logged last week were
the search work and the Oaxaca cleanup you asked for. Today's work, the
duplicates and the AI setup, is on this week."

---

## 6. If he asks something you do not know

"I would rather check than guess. Let me look and come back to you today."

## 7. After the call

Tell Claude what he asked for and what he said about the deploy. The
follow ups (repo private, deploy key, Puerto Escondido, cross account merge)
each have a written plan already.
