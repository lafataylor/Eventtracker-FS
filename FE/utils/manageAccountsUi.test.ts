// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountsCitySectionDefaultExpanded,
  accountsDesktopTableGridClass,
  accountsMobileTrackControlsOnTitleRow,
  accountsMobileTrackLabel,
  accountsRowShowsTrackingStatus,
} from './manageAccountsUi.ts';

test('Manage Accounts city sections open collapsed (every index)', () => {
  // Was index === 0 expanded; owner wants none open by default (LAF-62).
  assert.equal(accountsCitySectionDefaultExpanded(0), false);
  assert.equal(accountsCitySectionDefaultExpanded(1), false);
  assert.equal(accountsCitySectionDefaultExpanded(99), false);
});

test('Tracking status badge/column is gone on mobile and desktop', () => {
  assert.equal(accountsRowShowsTrackingStatus('mobile'), false);
  assert.equal(accountsRowShowsTrackingStatus('desktop'), false);
});

test('mobile feed/stories toggles live on the title row', () => {
  assert.equal(accountsMobileTrackControlsOnTitleRow(), true);
});

test('mobile track labels stay short for the title-row right side', () => {
  assert.equal(accountsMobileTrackLabel('track_feed'), 'Feed');
  assert.equal(accountsMobileTrackLabel('track_stories'), 'Stories');
});

test('desktop accounts table grid has no Status column slot', () => {
  const cls = accountsDesktopTableGridClass();
  assert.match(cls, /grid-cols-\[50px_2fr_1fr_1\.2fr_1\.2fr\]/);
  // Five columns: checkbox, username, date, feed, stories — not six with Status.
  assert.doesNotMatch(cls, /1\.2fr_1fr\]/);
});
