# Putting your changes live

Written for the owner. You can deploy on your own, from Cursor, any time.

## The short version

1. Make your change with Cursor and check it on your computer.
2. Get it onto `main` (Cursor commits it, opens a pull request, you merge it on GitHub).
3. In Cursor, say: **"deploy to production"**.
4. Watch **https://lafaslist.com/deploy-status** until it says **LIVE**. About 5 to 10 minutes.

That's it. Cursor knows the steps; they are written in `AGENTS.md`.

## What happens when you say "deploy"

Cursor runs `make deploy`. That marks the current `main` as "this should be
live" on GitHub (a branch called `production`). Nothing else happens on your
computer.

The server checks that mark every two minutes. When it moves, the server:

1. runs the 400 automatic checks on the new code,
2. builds the website,
3. swaps the new version in (the site blinks for under a minute),
4. opens every city page, the admin login and the API to make sure they work,
5. if anything fails, puts the previous version back on its own,
6. writes what happened on the status page.

If a step fails before the swap, nothing on the live site changes.

## Hours

Deploys run between **10pm and 3:30pm Central**. The nightly Instagram import
runs in the gap and a deploy would interrupt it. If you deploy outside those
hours, the status page says **WAITING** and it goes out on its own when the
hours open. You don't need to do anything.

## What the status page can say

- **LIVE**: your change is on the site.
- **WAITING**: outside deploy hours; it will go by itself.
- **DEPLOYING**: in progress.
- **FAILED ... the website did not build**: usually a typo. Paste the status
  page into Cursor and ask it to fix it, then deploy again. The live site was
  not touched.
- **FAILED ... the automatic tests did not pass**: same, paste it into Cursor.
- **STOPPED ... it needs a developer**: the change touches the database layout
  or the server's Python packages. Those can damage live data if they go out
  automatically, so they wait for Zain. Send him the status page.

## Undo

Say **"roll back production"** in Cursor (it runs `make rollback`). The
previous version goes back live within about 10 minutes. Then ask Cursor to
undo the change on `main` too, otherwise the next deploy brings it back.

## For developers

- Owner side: `scripts/deploy.sh` (`make deploy`, `make deploy-status`, `make rollback`).
- Server side: `scripts/server/autodeploy.sh`, installed as
  `/home/ubuntu/misc/autodeploy.sh`, run every 2 minutes from the ubuntu
  crontab. State in `/home/ubuntu/autodeploy/` (`live_sha`,
  `live_api_tree`, `live_fe_tree`, `history.log`, last test/build output).
  Status file `/var/www/lafaslist-deploy/status.txt`, served by nginx at
  `/deploy-status`.
- Safety rail tests: `make test-deploy`.
- The server only reads from GitHub (public repo, anonymous). If the repo goes
  private it needs a read-only deploy key in `/home/ubuntu/autodeploy/repo`.
- The old `server-api` / `server-fe` branches are retired; `production` is
  what's live.
