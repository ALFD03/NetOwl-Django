import { useCallback, useEffect, useState } from 'react';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import type { SubscriptionEtaReportResponse } from '@/features/subscriptions/types';

export function useSubscriptionEtaReport(initialData: SubscriptionEtaReportResponse | null, period: string) {
  const [data, setData] = useState<SubscriptionEtaReportResponse>(initialData ?? {} as SubscriptionEtaReportResponse);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async (selectedPeriod: string, force = false) => {
    if (!selectedPeriod) return;
    setLoading(true);
    try {
      const result = await subscriptionsApi.getEtaReport(selectedPeriod, force);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (period && period !== data.periodo) {
      void fetchReport(period);
    }
  }, [period, data.periodo, fetchReport]);

  return { data, loading, fetchReport, setData };
}
