// Manage Accounts list layout rules (owner LAF-62, 2026-11-22).
//
// Mobile rows used to show a green "Tracking" badge on the title-row right
// plus separate Track feed / Track stories checkboxes underneath — redundant.
// Toggles move onto the title-row right; the status badge goes away.
// City sections open collapsed so the page is scannable on a phone.

/** City / location accordion starts collapsed when Manage Accounts opens. */
export function accountsCitySectionDefaultExpanded(_index: number): boolean {
  return false;
}

/**
 * Whether a row surface still shows the "Tracking" status badge/column.
 * Both mobile and desktop drop it; feed/stories toggles are the controls.
 */
export function accountsRowShowsTrackingStatus(
  surface: 'mobile' | 'desktop'
): boolean {
  void surface;
  return false;
}

/** Mobile: feed/stories sit on the title row (right), not under the Added line. */
export function accountsMobileTrackControlsOnTitleRow(): boolean {
  return true;
}

/** Compact mobile labels — full "Track feed" is too wide beside the handle. */
export function accountsMobileTrackLabel(
  field: 'track_feed' | 'track_stories'
): string {
  return field === 'track_feed' ? 'Feed' : 'Stories';
}

/** Desktop table grid without the Status column. */
export function accountsDesktopTableGridClass(): string {
  return 'grid-cols-[50px_2fr_1fr_1.2fr_1.2fr]';
}
