#!/bin/bash
# Synthetic check for client-side crashes on lafaslist.com.
#
# WHY THIS EXISTS AND WHY IT USES A BROWSER: on 2026-09-01 a null field made
# React unmount the whole app, and every visitor saw a blank page reading
# "Application error: a client-side exception has occurred". The SERVER was
# healthy the entire time — it returned 200, the HTML was correct, and the
# deploy verifier's curl saw nothing wrong. The failure only exists after
# hydration, so it can only be seen by something that actually runs the page's
# JavaScript. curl cannot catch this class of bug. We found out because the
# owner texted a screenshot; this is here so that never has to happen again.
#
# Exit 0 = pages render with real content. Anything else = investigate.
#   1 = a page is broken for real users
#   2 = the check could not run (treat as UNKNOWN, not as healthy)
#
# Run it hourly:
#   0 * * * * /path/to/scripts/smoke_check.sh >> /tmp/lafaslist_smoke.log 2>&1
set -uo pipefail

# Scheduled runs execute a COPY at ~/.local/bin/lafaslist_smoke.sh via the
# LaunchAgent com.lafaslist.smoke — NOT this file. macOS TCC silently blocks
# cron/launchd from reading anything under ~/Documents ("Operation not
# permitted"), which is exactly how the first install "worked" when proven by
# hand and then never ran once on schedule. After editing this file, reinstall:
#   cp scripts/smoke_check.sh ~/.local/bin/lafaslist_smoke.sh
# launchd also ships a bare PATH, where Homebrew's `timeout` and agent-browser
# do not exist; without the next line every page reports NAVIGATION_FAILED.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

BASE="${SMOKE_BASE_URL:-https://lafaslist.com}"
# A dedicated browser session (SESSION, below) rather than the default one:
# the default session is where interactive debugging happens, and an hourly
# job navigating it away mid-investigation (or being navigated away itself)
# makes both unreliable.
PAGES=("/" "/mexico-city/" "/los-angeles/" "/berlin/" "/bali/")
PER_PAGE_TIMEOUT=60
FAILED=0

# cron runs with PATH=/usr/bin:/bin, where a homebrew/npm-global binary is NOT
# on the path. Exiting 0 here would make this script a monitor that silently
# no-ops forever while reporting success, so a missing browser is exit 2.
# An override is honoured only if it actually runs; otherwise this reports a
# broken SITE when the truth is a broken CHECK.
BROWSER="${AGENT_BROWSER_BIN:-}"
if [ -n "$BROWSER" ] && [ ! -x "$BROWSER" ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') UNKNOWN: AGENT_BROWSER_BIN='$BROWSER'"
    echo "is not executable; nothing was verified."
    exit 2
fi
if [ -z "$BROWSER" ]; then
    for candidate in \
        "$(command -v agent-browser 2>/dev/null)" \
        /opt/homebrew/bin/agent-browser \
        /usr/local/bin/agent-browser \
        "$HOME/.npm-global/bin/agent-browser"; do
        [ -n "$candidate" ] && [ -x "$candidate" ] && { BROWSER="$candidate"; break; }
    done
fi
if [ -z "$BROWSER" ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') UNKNOWN: agent-browser not found;"
    echo "this check needs a real browser and did NOT verify anything."
    exit 2
fi

# The expected host, so a page that never loaded cannot pass. A failed
# navigation lands on chrome-error://chromewebdata, whose body text is 129-162
# characters — comfortably past any "is it empty" threshold, containing
# neither "Application error" nor our marker. Before this check, a dead DNS
# entry or a refused connection reported "all 5 pages render" indefinitely.
EXPECT_HOST=$(printf '%s' "$BASE" | sed -E 's#^https?://##; s#/.*$##; s#:.*$##')

# The session name is derived from the host, not fixed, so a run against a
# different BASE cannot disturb the production monitor. On 2026-09-09 a test
# run against example.com shared the single "smoke" session with the hourly
# LaunchAgent; the scheduled run inherited that page and wrote
# "FAIL /bali/ -> WRONG_HOST:example.com" into the log a human reads. My own
# testing must never be able to forge a production alarm.
SESSION="smoke-${EXPECT_HOST}"

# Release the browser when this run ends, however it ends. A session persists
# between runs by design, so the hourly check was reusing one Chrome for as
# long as the machine stayed awake: on 2026-09-07 that session had been alive
# six hours and the agent-browser processes together held 1.7 GB on the dev
# machine. Closing costs a cold start (seconds, against runs that already take
# minutes) and caps the cost at one run. The trap runs no `exit`, so the
# script's own exit status is preserved.
# Bounded like every other browser call: a wedged agent-browser is the most
# likely reason this session ever needed closing, and an unbounded close would
# hang the run forever instead of ending it (`|| true` does not help - it only
# swallows the status once the command finally returns).
cleanup() { timeout 20 "$BROWSER" --session "$SESSION" close >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Any bad verdict is ambiguous: the SITE may be down, or THIS MACHINE may have
# no network. On 2026-09-08 the Mac dark-woke at 19:25:16 UTC, launchd fired
# the missed run five seconds later before Wi-Fi was usable, and the check
# reported the site broken while it was serving 200s in under 0.4s. A monitor
# that cries wolf on every wake is one you stop believing, which is the whole
# failure it exists to prevent.
#
# The first version of this guard only covered a FAILED navigation, and a
# second wake on 2026-09-09 slipped straight past it: the browser's `open`
# SUCCEEDED, landed on a blank page, and the host check then reported
# "WRONG_HOST:" with an empty host — the same false alarm through a different
# door. So the rule is general now: before calling anything a failure, ask
# curl. No network anywhere means UNKNOWN (exit 2, "nothing was verified").
# A pure predicate on purpose. It used to print and `exit 2` itself, which
# silently stopped working once check_page moved into a $( ) command
# substitution: that runs in a subshell, so the exit killed only the subshell
# and the UNKNOWN text was captured as the page's verdict. The caller runs in
# the real shell and owns the exit.
network_reaches() {
    curl -sS -L --max-time 15 -o /dev/null "${BASE}${1}" 2>/dev/null
}

# One page, one verdict: echoes "ok" or the reason it failed. Kept as a
# function so a failing page can simply be tried again (see the retry below).
check_page() {
    local page="$1"
    if ! timeout "$PER_PAGE_TIMEOUT" "$BROWSER" --session "$SESSION" open "${BASE}${page}" >/dev/null 2>&1; then
        network_reaches "$page" || { echo "OFFLINE"; return; }
        echo "NAVIGATION_FAILED (curl reached it)"
        return
    fi
    # Hydration plus the first data fetch. The 2026-09-01 crash only appeared
    # once events arrived, so checking too early would have reported healthy.
    sleep 8

    verdict=$(timeout "$PER_PAGE_TIMEOUT" "$BROWSER" --session "$SESSION" eval \
        "(() => {
            // Prove we are looking at the page we asked for, not a browser
            // error page and not the PREVIOUS page's DOM.
            if (!location.host.includes('${EXPECT_HOST}')) return 'WRONG_HOST:' + location.host;
            const t = document.body.innerText;
            if (t.includes('Application error')) return 'CRASH';
            // Our ErrorBoundary REPLACES the 'Application error' text with its
            // own panel, so grepping for that string alone would report a
            // healthy site while every visitor sees a failure. Verified
            // against a deliberately broken build.
            if (document.querySelector('[data-crashed]')) return 'CAUGHT_CRASH';
            // A page that hydrates but lists nothing is also broken: nav plus
            // a logo already clears any short character threshold.
            const hasContent = /\\\\d{1,2}:\\\\d{2}\\\\s*(AM|PM)/i.test(t)
                || /No Events Found/i.test(t)
                || t.replace(/\\\\s+/g, ' ').trim().length > 400;
            return hasContent ? 'ok' : 'NO_CONTENT';
        })()" 2>/dev/null | tr -d '"')

    if [ -z "$verdict" ]; then
        network_reaches "$page" || { echo "OFFLINE"; return; }
        echo "NO_RESPONSE_FROM_BROWSER"
    elif [ "$verdict" != "ok" ]; then
        # Same guard as a failed navigation: an offline machine produces
        # WRONG_HOST (empty host) and NO_CONTENT just as readily as a broken
        # site does, and only curl can tell them apart.
        network_reaches "$page" || { echo "OFFLINE"; return; }
        echo "$verdict"
    else
        echo "ok"
    fi
}

for page in "${PAGES[@]}"; do
    verdict=$(check_page "$page")
    if [ "$verdict" = "OFFLINE" ]; then
        echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') UNKNOWN: no network from this"
        echo "machine (curl cannot reach ${page} either); nothing was verified."
        echo "Normal for a moment after the Mac wakes."
        exit 2
    fi
    if [ "$verdict" != "ok" ]; then
        # Try once more before crying wolf. network_reaches only proves the
        # site is REACHABLE, not that the connection is healthy: on 2026-09-09
        # a degraded link around a sleep cycle let curl through in 19 s while
        # the browser starved and reported NO_CONTENT on two pages, with the
        # server answering every request in 0.2 s the whole time. That was the
        # third false alarm in two days from the same cause. A genuinely broken
        # page fails twice; a network blip does not.
        sleep 5
        verdict=$(check_page "$page")
        if [ "$verdict" = "OFFLINE" ]; then
            echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') UNKNOWN: no network from this"
            echo "machine (curl cannot reach ${page} either); nothing was verified."
            exit 2
        fi
        if [ "$verdict" != "ok" ]; then
            echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') FAIL ${page} -> ${verdict} (twice)"
            FAILED=1
        fi
    fi
done

if [ "$FAILED" -eq 0 ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ok: all ${#PAGES[@]} pages render with content"
    exit 0
fi

echo "SITE IS BROKEN FOR USERS — check the browser console and"
echo "logs/client_errors.log on the API box."
exit 1
