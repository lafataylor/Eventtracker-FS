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
# --session smoke everywhere below: the default session is where interactive
# debugging happens, and an hourly cron navigating it away mid-investigation
# (or being navigated away itself) makes both unreliable.
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

for page in "${PAGES[@]}"; do
    if ! timeout "$PER_PAGE_TIMEOUT" "$BROWSER" --session smoke open "${BASE}${page}" >/dev/null 2>&1; then
        echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') FAIL ${page} -> NAVIGATION_FAILED"
        FAILED=1
        continue
    fi
    # Hydration plus the first data fetch. The 2026-09-01 crash only appeared
    # once events arrived, so checking too early would have reported healthy.
    sleep 8

    verdict=$(timeout "$PER_PAGE_TIMEOUT" "$BROWSER" --session smoke eval \
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
        echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') FAIL ${page} -> NO_RESPONSE_FROM_BROWSER"
        FAILED=1
    elif [ "$verdict" != "ok" ]; then
        echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') FAIL ${page} -> ${verdict}"
        FAILED=1
    fi
done

if [ "$FAILED" -eq 0 ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ok: all ${#PAGES[@]} pages render with content"
    exit 0
fi

echo "SITE IS BROKEN FOR USERS — check the browser console and"
echo "logs/client_errors.log on the API box."
exit 1
