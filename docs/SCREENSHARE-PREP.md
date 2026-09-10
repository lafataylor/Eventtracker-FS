# Screen share prep: how Lafa's List actually works

Written for you to read twice and then run the call without notes. Plain
language on purpose. Numbers are live as of 2026-09-10.

---

## 1. The one sentence version

Every night the system reads the Instagram accounts Lafayette follows, uses AI
to read each flyer image and pull out the event details, and puts the results
on the four city pages. Nobody types anything in by hand.

**If he asks nothing else, that is the product.**

---

## 2. The journey of one event, start to finish

Say a Berlin club posts a flyer at 6pm.

1. **21:01 UTC every night**, a scheduled job wakes up and goes through all
   **576 accounts** on the list.
2. For each account it asks Apify (a scraping service) for that account's
   recent posts. It only takes posts newer than the last time it looked, so it
   is not re-reading the whole history every night.
3. Each post's images get downloaded and uploaded to Firebase storage, so the
   site has a permanent copy of the flyer even if Instagram changes.
4. **The images go to OpenAI**, which reads the flyer and the caption and
   returns structured details: name, date, time, venue, price, genre, artists,
   ticket link, and which city it belongs to.
5. Those come back and get saved as events. **A carousel post with 5 slides
   becomes up to 5 separate events**, which is one of the three things he
   hired us for.
6. **03:37 UTC**, a second job looks for duplicates and merges the obvious ones.
7. **04:10 UTC**, a third job deletes events more than 30 days past, and clears
   out old image files.
8. In the morning the city pages show what came in.

Last night that produced **411 new events**.

**The one line to remember:** it reads the flyer with AI, it does not read a
calendar feed. That is why dates and duplicates are the hard parts.

---

## 3. Where it stands today

| | |
|---|---|
| Accounts tracked | 576 |
| Events in the database | 19,887 |
| Upcoming and visible right now | 2,317 |
| Mexico City / LA / Berlin / Bali | 1,056 / 595 / 444 / 222 |
| Hidden as duplicates | 10,835 |
| Hidden as not-an-event | 14,040 |
| Merged automatically | 10,837 |
| Pairs still waiting for review | 567 |

That "hidden as not-an-event" number is worth understanding: the AI also reads
posts that are **not** events, a menu photo, a staff shoutout, and marks them
so they never reach the site. 14,040 of those have been caught.

---

## 4. Before and after, honestly

This is the part he will care about most.

**When we started**
- Ingestion had been **dead for 11 days**. Nothing new was coming in at all.
- The server disk was **full**, which is what had killed it.
- The database migration history did not match the actual database, so nothing
  could be changed safely.
- A carousel post with 5 events produced **1 event**. Four were thrown away.
- Search looked at the event title only.
- Duplicates were detected but nothing merged them.
- No backups. No monitoring. If the site broke, you found out from a user.

**Now**
- Ingestion runs nightly and produced 411 events last night.
- Disk is at 56%, with old images cleaned automatically every night.
- Carousels split properly, on both the nightly path and manual add.
- Search covers every field: title, artist, opener, host, promoter, genre,
  venue, address, city, and the Instagram handle. Accents are ignored, and
  hip-hop, hiphop and hip hop all find each other. A typo like "zennerr" still
  finds Zenner.
- 10,837 duplicate pairs merged automatically. A review page for the unclear ones.
- Events older than 30 days delete themselves, which he approved.
- The site is checked every hour by a real browser, so a crash is caught in
  under an hour instead of by a customer.
- Nightly database backups before anything destructive runs.

---

## 5. The three tickets, in his words

**"Fix duplicate logic"** — Done and running nightly. The system compares
title, venue, artist and date, merges what it is confident about, and holds the
rest. 10,837 merged so far.

**"Grab all different events in a carousel post, not just one"** — Done. The AI
now returns a list of events per post with which slide each came from, and each
gets its own listing. Also fixed on the manual add-by-link path, which was
still only taking the first event.

**"Make search search every field plus fuzzy"** — Done. Every field, plus typo
tolerance shipped this week.

---

## 6. What runs by itself, every day

| Time (UTC) | What |
|---|---|
| 21:01 | Read all accounts, extract events with AI |
| 03:37 | Find and merge duplicates |
| 04:10 | Delete events 30+ days past, clean old images, back up first |
| Hourly | Load the real site in a browser and check it renders |

---

## 7. Where things live

- **The server** is one AWS machine that runs both the API and the website.
- **The database** is a single SQLite file on that machine, 578 MB.
- **The code** is on GitHub, and this is the thing to raise: it is **public**
  right now and contains live passwords and API keys.
- **The AI** is OpenAI, billed to his account. When it ran out of credits last
  week, ingestion stopped, which is exactly what happened Wednesday.
- **Scraping** goes through Apify, also his account.

---

## 8. Questions he is likely to ask, and the honest answer

**"Why are there still duplicates?"**
Because the same event gets posted by more than one account, or by the same
account on different days, and the AI rewrites the title each time. The system
scores each pair out of 100 and only merges by itself above 95. Everything from
82 to 95 waits for review, and that queue is 567. Lowering that bar carefully
is a 2 to 3 hour job that would clear about 300 of them.

**"Why did this event get the wrong date?"**
Recurring events. If a post says "every Thursday" the system expands it, but if
it only says "Thursday", it stores a single date and often the wrong one. Same
root cause as the RunGood ones on Sept 23.

**"Why did it take 40 hours instead of 30?"**
About 19 went to the three tickets, which was inside the estimate. The other 21
went to things that were not on the list: ingestion was dead when we started,
the disk filled twice, the site crashed, the credits ran out. Some of it,
around 11 hours, was our own judgement calls, monitoring and auto-delete and
the city filter, that should have been checked with him first.

**"Is it safe?"**
Not yet, and be straight about this. The code repository is public and has
working passwords in it. It needs to go private, and those passwords need
changing. Only he can flip the repository, we do not have the rights.

**"What happens if you disappear?"**
Everything runs on schedule without anyone touching it. The risk is that the
passwords are in a public place and there is one server with no standby.

---

## 9. If he asks something you do not know

Say "I would rather check than guess, let me look and come back to you." That
answer has never cost anyone a client. Guessing has.

---

## 10. Still open, so you are not caught out

- The repo is public. Needs him.
- Old admin logins still active. Disabling them needs the scraper given its own
  login first, about 2 hours.
- 567 duplicate pairs waiting. 2 to 3 hours to clear most.
- Recurring events get single wrong dates.
- Puerto Escondido, 12 events, waiting on his answer.
- The database is 578 MB and 96% of that is old debug logs, which makes every
  backup slow. Half a day to fix. He said hold.
