import { useEffect, useState } from 'react';

import { crmApi } from '@/shared/lib/api/crm';
import type { CrmDimensionRow } from '@/features/crm/types';

/**
 * Dimension rows of one closed period, loaded when its Results modal opens.
 *
 * Results lists every period at once, so its rows are fetched per period on
 * demand instead of shipping every dimension of every month in the page props.
 */
export function useCrmPeriodDimensions(period: string | null) {
  const [rows, setRows] = useState<CrmDimensionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!period) {
      setRows([]);
      return;
    }

    let active = true;
    setLoading(true);

    crmApi.getDimensions(period)
      .then((result) => { if (active) setRows(result.dimensiones ?? []); })
      .catch(() => { if (active) setRows([]); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [period]);

  return { rows, loading };
}
