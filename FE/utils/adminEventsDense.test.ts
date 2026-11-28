// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_EVENTS_ICON_BTN_PX,
  ADMIN_EVENTS_MOBILE_HEADER_PX,
  ADMIN_EVENTS_MOBILE_TOOLBAR_PX,
  adminEventsDenseContentPadClass,
  adminEventsDenseIconBtnClass,
  adminEventsDenseMainPaneClass,
  adminEventsDenseSelectBtnClass,
  adminEventsDenseToolbarClass,
  shouldHideAdminChrome,
} from './adminEventsDense.ts';

test('dense Events header/toolbar sizes match owner range', () => {
  assert.ok(
    ADMIN_EVENTS_MOBILE_HEADER_PX >= 52 && ADMIN_EVENTS_MOBILE_HEADER_PX <= 56
  );
  assert.equal(ADMIN_EVENTS_MOBILE_TOOLBAR_PX, 56);
  assert.ok(
    ADMIN_EVENTS_ICON_BTN_PX >= 40 && ADMIN_EVENTS_ICON_BTN_PX <= 44
  );
});

test('main pane uses 12px horizontal padding on mobile', () => {
  const cls = adminEventsDenseMainPaneClass();
  assert.match(cls, /\bpx-3\b/);
  assert.match(cls, /\bmd:px-8\b/);
  assert.match(cls, /pt-\[56px\]/);
});

test('toolbar is one fixed row under the header and slides away when hidden', () => {
  const shown = adminEventsDenseToolbarClass(false);
  assert.match(shown, /\bfixed\b/);
  assert.match(shown, /top-\[56px\]/);
  assert.match(shown, /\bgap-2\b/);
  assert.match(shown, /\bpx-3\b/);
  assert.match(shown, /\btranslate-y-0\b/);
  assert.doesNotMatch(shown, /-translate-y-\[calc/);

  const hidden = adminEventsDenseToolbarClass(true);
  assert.match(hidden, /-translate-y-\[calc\(100%\+56px\)\]/);
});

test('icon buttons are 44px touch targets', () => {
  const cls = adminEventsDenseIconBtnClass();
  assert.match(cls, /\bw-11\b/);
  assert.match(cls, /\bh-11\b/);
  assert.match(cls, /min-w-\[44px\]/);
  assert.match(cls, /min-h-\[44px\]/);
});

test('icon button marks an active filter/sort state', () => {
  const active = adminEventsDenseIconBtnClass(true);
  assert.match(active, /\bbg-pearl-white\b/);
  const idle = adminEventsDenseIconBtnClass(false);
  assert.match(idle, /\bbg-slate-black\b/);
});

test('Select sits beside the label and is mobile-only', () => {
  const cls = adminEventsDenseSelectBtnClass();
  assert.match(cls, /\bmd:hidden\b/);
  assert.match(cls, /min-h-\[40px\]/);
});

test('content pad shrinks when chrome is hidden', () => {
  assert.match(adminEventsDenseContentPadClass(false), /pt-\[56px\]/);
  assert.match(adminEventsDenseContentPadClass(true), /\bpt-2\b/);
});

test('scroll down hides chrome; scroll up reveals; top always shows', () => {
  assert.equal(
    shouldHideAdminChrome({
      scrollTop: 120,
      lastScrollTop: 100,
      currentlyHidden: false,
    }),
    true
  );
  assert.equal(
    shouldHideAdminChrome({
      scrollTop: 80,
      lastScrollTop: 100,
      currentlyHidden: true,
    }),
    false
  );
  assert.equal(
    shouldHideAdminChrome({
      scrollTop: 2,
      lastScrollTop: 40,
      currentlyHidden: true,
    }),
    false
  );
  // Noise under threshold keeps prior state.
  assert.equal(
    shouldHideAdminChrome({
      scrollTop: 104,
      lastScrollTop: 100,
      currentlyHidden: false,
      threshold: 6,
    }),
    false
  );
  assert.equal(
    shouldHideAdminChrome({
      scrollTop: 104,
      lastScrollTop: 100,
      currentlyHidden: true,
      threshold: 6,
    }),
    true
  );
});
