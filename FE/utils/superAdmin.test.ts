// Run: npm test
//
// Who sees the full admin menu. Until 2026-09-18 two addresses were
// hardcoded in two files, so the OWNER's new login would have opened an
// admin with only Events, Errors and Duplicates: no Accounts, Users, Runs,
// Feedback, Details or Settings. Found by logging in as a normal admin in
// the end-to-end pass. The list now comes from NEXT_PUBLIC_SUPERADMIN_EMAILS
// (so a real address never lands in this public repo), the two original
// service logins stay as defaults, and case is ignored, because a phone
// capitalises the first letter of an email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSuperAdminEmail } from './superAdmin.ts';

test('the two original service logins are still full admins', () => {
  assert.equal(isSuperAdminEmail('dummy_@gmail.com', ''), true);
  assert.equal(isSuperAdminEmail('superadmin@eventtracker.lafaslist.com', undefined), true);
});

test('an address from the environment list is a full admin', () => {
  assert.equal(isSuperAdminEmail('owner@example.com', 'owner@example.com, second@example.com'), true);
  assert.equal(isSuperAdminEmail('second@example.com', 'owner@example.com, second@example.com'), true);
});

test('case and stray spaces do not matter', () => {
  assert.equal(isSuperAdminEmail(' Owner@Example.com ', 'owner@example.com'), true);
  assert.equal(isSuperAdminEmail('owner@example.com', ' OWNER@example.COM '), true);
});

test('any other admin gets the reduced menu', () => {
  assert.equal(isSuperAdminEmail('venue@example.com', 'owner@example.com'), false);
  assert.equal(isSuperAdminEmail('', 'owner@example.com'), false);
  assert.equal(isSuperAdminEmail(null, 'owner@example.com'), false);
});
