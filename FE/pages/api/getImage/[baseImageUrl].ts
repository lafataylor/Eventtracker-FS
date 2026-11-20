export const maxDuration = 10;
export const dynamic = 'force-dynamic';

import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  maxDuration: 10,
};

/** Legacy route. Intentionally returns 404; unused by public flyer URLs. */
export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  return res.status(404).json({ error: 'Not found' });
}
