/** Carga el detalle de un periodo cuando se abre su modal. */

import { useEffect, useState } from 'react';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import type { SubscriptionResultsResponse } from '@/features/subscriptions/types';

export function useSubscriptionResults(period: string | null) {
  const [data, setData] = useState<SubscriptionResultsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!period) {
      setData(null);
      return;
    }

    let active = true;
    setLoading(true);

    subscriptionsApi.getResultsDetails(period)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [period]);

  return { data, loading };
}
