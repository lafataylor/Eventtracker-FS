# Working on Lafa's List with an AI coding assistant

Written for Lafayette. No programming knowledge assumed.

## What "set up for AI-assisted development" means here

An AI coding assistant such as Claude Code is a program you run on your own
computer. You type what you want in plain English, it reads the project,
changes the code, runs the tests, and shows you what it did. For that to go
well, the project needs four things, and it now has all four:

1. **A briefing the assistant reads on its own.** `AGENTS.md` at the top of
   the project explains what the site is, how it is put together, how to run
   it, and the rules (never touch the live site, never spend credits without
   asking, always run the tests). Claude Code, Cursor and Codex all read it.
2. **A one-command setup.** `make setup` installs everything and proves it
   works by running the tests. It used to take a day of trial and error.
3. **A test suite that says whether the code still works.** Over 300 checks,
   three seconds. The assistant runs them before and after every change.
4. **A local copy that cannot hurt the real site.** The setup pins every
   outside connection to your own machine and uses placeholder keys, so
   nothing you or the assistant do locally can reach lafaslist.com, its
   database, or your OpenAI and Apify balance.

## What you need

- A Mac (Windows works too, the steps differ slightly).
- A Claude Pro or Max subscription (claude.ai). Claude Code runs on it.
- Access to the GitHub repository (you own it).
- About 20 minutes the first time.

## First time, step by step

1. **Install Claude Code.** Open the Terminal app and paste:
   `curl -fsSL https://claude.ai/install.sh | bash`
   Nothing else is required.
2. **Get the project.** In Terminal:
   `git clone https://github.com/lafataylor/Eventtracker-FS.git`
   then `cd Eventtracker-FS`.
   (If `git` is missing, macOS offers to install it; say yes.)
3. **Set it up.** `make setup`. It prints what it is doing and ends with the
   test results. Expect "OK". If it stops with a message about Python or
   Node, install what it names (`brew install python@3.12` or
   `brew install node`) and run `make setup` again.
4. **Start the assistant.** `claude`. The first run opens your browser to log
   in with your Claude account. After that you are talking to it inside the
   project.
5. **See the site running on your machine (optional).** In a second Terminal
   window, `make api`, and in a third, `make fe`. Open
   http://127.0.0.1:3009/mexico-city. The setup put a few made-up events in
   so the pages are not empty. This is your private copy; nobody else sees it.

## How to work with it

Say what you want the way you would to a developer. Good first asks:

- "Explain how a post becomes an event on the site, in plain language."
- "Show me where the 30-day deletion rule lives and what would change if it
  were 14 days."
- "The venue name on the event card is too small. Make it the same size as
  the date." Then look at http://127.0.0.1:3009 and say whether you like it.
- "Run the tests."

Ask it to explain before it changes anything, and ask it to run the tests
after. It will show you every edit; you can say no.

### Getting a change onto the real site

The assistant works on your computer only. Nothing it does appears on
lafaslist.com by itself, which is deliberate. When you are happy with a
change, tell it: "Put this on a branch and open a pull request." That sends
the change to GitHub for review. Zain reviews it, runs it against a copy of
the real data, and deploys it in the nightly maintenance window. That review
step is what keeps a wrong change from taking the site down.

### What it will not do on its own

- Touch the live site, its database, or your Instagram accounts list.
- Run the scraper against real accounts or spend OpenAI or Apify credits.
  The local copy has placeholder keys; the scraper simply refuses.
- Deploy. Only the maintainer's deploy branches reach the server.

## Useful commands inside Claude Code

- `/help` lists what it can do.
- `/clear` starts a fresh conversation (do this when changing topics).
- `Shift+Tab` switches how much it asks before acting. "Manual" asks before
  every edit and command, which is the right setting to start with.
- There is a VS Code extension if you prefer seeing changes side by side
  instead of in a terminal.

## Things to know

- **Cost.** Claude Code uses your subscription. Long sessions use it faster.
- **Secrets.** The files that hold real keys (`.env.local`) are never uploaded
  to GitHub, and the setup never creates them. Do not paste keys into a chat
  with the assistant or into any file it can commit.
- **It can be wrong.** It is good at reading and explaining this codebase and
  at small, well-described changes. For anything touching the nightly
  scraper, the duplicate rules, or the database, treat its work as a draft
  for Zain to check.
- **The repository is public today.** Making it private is a one-click
  change in GitHub settings (owner only) and is recommended; the server
  needs a read-only deploy key added first, which Zain can prepare.
