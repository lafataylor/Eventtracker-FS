export const maxDuration = 10;
export const dynamic = 'force-dynamic';

import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  maxDuration: 10,
};

/**
 * Permanently disabled for Cursor Publish + production FE.
 *
 * 2026-11-19: Publish blocked on this path for missing auth, SSRF (caller-
 * chosen fetch), open CORS, and paid OpenAI/Firebase side effects. Auth +
 * host allowlist (#31) were not enough for a clean review while the fetch /
 * OpenAI body still shipped. Nightly scrape never used this route (Django
 * c_admin). Public flyers use Firebase orig_thumb URLs directly.
 *
 * Do not reintroduce server-side fetch-of-caller-URL here without a fresh
 * Publish security pass. Admin/experimental extract lives on Django now.
 */
export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  return res.status(404).json({ error: 'Not found' });
}
