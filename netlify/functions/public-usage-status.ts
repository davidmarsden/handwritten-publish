import { json } from './_shared/microblog';
import { publicPublishingDisabledResponse, publicUsageStatus } from './_shared/public-usage';

export default async (request: Request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);

  const disabled = publicPublishingDisabledResponse();
  try {
    const status = await publicUsageStatus();
    return json({
      ...status,
      publishingEnabled: !disabled,
    });
  } catch {
    return json({ error: 'Public demo usage is temporarily unavailable.' }, 503);
  }
};

export const config = {
  path: '/api/public-usage',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
