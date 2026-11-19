export const maxDuration = 10;
export const dynamic = 'force-dynamic';

import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  maxDuration: 10,
};

/**
 * Default-off stub for Cursor Publish / phone preview.
 *
 * 2026-11-19: Prior Publish blocks named this file for missing auth (critical),
 * SSRF (critical), open CORS, and paid OpenAI/Firebase side effects. Auth +
 * host allowlist landed in #31; the live body now lives in
 * server/runGetImageRequest.ts and loads only when ENABLE_GETIMAGE=1.
 * Nightly production scrape does not use this route.
 */
export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.ENABLE_GETIMAGE !== '1') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { runGetImageRequest } = await import(
    '../../../server/runGetImageRequest'
  );
  return runGetImageRequest(req, res);
};
