// Requests that together cover `loaded` items when one request may carry at
// most `cap`. Used to reload a "Load more" list in place: the duplicates
// page reloaded everything on screen in ONE request, the API caps a request
// at 100 groups, and with 216 groups on screen the other 116 silently
// vanished after a verdict (review of PR #8). Always at least one page.
export function pageChunks(
  loaded: number,
  cap: number,
  pageSize: number
): { offset: number; limit: number }[] {
  const want = Math.max(loaded, pageSize);
  const chunks: { offset: number; limit: number }[] = [];
  for (let offset = 0; offset < want; offset += cap) {
    chunks.push({ offset, limit: Math.min(cap, want - offset) });
  }
  return chunks;
}
