import React from 'react';
import { getApiBase } from '../utils/locations';

interface Props {
  children: React.ReactNode;
  /** Changes on navigation so a crash on one page does not brick the rest of
   *  the session: without it `failed` latches true and every subsequent
   *  client-side navigation renders the fallback, escapable only by a full
   *  reload. */
  resetKey?: string;
}

interface State {
  failed: boolean;
}

/**
 * Keeps a render-time exception from taking the whole site down.
 *
 * On 2026-09-01 a null `offering` reached an unguarded `.trim()`, React
 * unmounted the entire app, and every visitor got Next's bare "Application
 * error: a client-side exception has occurred" on a blank page. The server
 * still returned 200, so nothing in the logs or the deploy verifier could see
 * it — we found out because the owner texted a screenshot.
 *
 * This does two things about that: the page keeps its chrome and shows a
 * retry instead of a blank screen, and the crash is reported so we hear about
 * the next one before he does.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      void fetch(`${getApiBase()}/event/clientError/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Truncated here as well as server-side: a render loop can throw a
        // very large stack, and this request must stay cheap.
        body: JSON.stringify({
          message: String(error?.message || error).slice(0, 500),
          stack: String(error?.stack || '').slice(0, 2000),
          component: String(info?.componentStack || '').slice(0, 1000),
          path: typeof window !== 'undefined' ? window.location.pathname : '',
        }),
        keepalive: true,
      }).catch(() => {
        /* swallow: reporting a crash must never cause one */
      });
    } catch {
      /* same — never let the reporter throw inside the handler */
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      // data-crashed is the machine-readable signal scripts/smoke_check.sh
      // looks for. Without it the boundary would HIDE crashes from monitoring:
      // it replaces Next's "Application error" text, so a check that greps for
      // that string reports a healthy site while every visitor sees this
      // panel. Verified against a deliberately broken build. Do not remove or
      // rename without updating that script.
      <div
        data-crashed="1"
        className="w-full flex flex-col items-center justify-center gap-4 py-24 px-6 text-center text-off-white"
      >
        <div className="text-2xl font-bold">This didn’t load properly.</div>
        {/* This panel replaces the whole page, nav included, because the
            boundary sits above the page component. So it has to offer its own
            way out - an earlier version told the visitor "the rest of the
            site is fine" while giving them no link to any of it. */}
        <div className="text-off-white text-opacity-80 max-w-md">
          Something went wrong showing these events. We’ve been notified — try
          again, or pick a city below.
        </div>
        <button
          className="py-2 px-6 rounded-lg bg-beaming-orange text-black font-semibold"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          {[['Mexico City', '/mexico-city/'], ['Los Angeles', '/los-angeles/'],
            ['Berlin', '/berlin/'], ['Bali', '/bali/']].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="underline text-off-white text-opacity-80 hover:text-beaming-orange"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
