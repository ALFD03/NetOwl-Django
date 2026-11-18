import { useEffect, useState } from 'react';

import { crmApi } from '@/shared/lib/api/crm';
import type { CrmDimensionRow } from '@/features/crm/types';

const NO_ROWS: CrmDimensionRow[] = [];

/**
 * Dimension rows of one closed period, loaded when its Results modal opens.
 *
 * Results lists every period at once, so its rows are fetched per period on
 * demand instead of shipping every dimension of every month in the page props.
 *
 * La respuesta se guarda con el periodo al que pertenece y `loading` se deriva
 * de ahí: mientras llega la de otro periodo no se enseñan las filas del
 * anterior, y el efecto no tiene que vaciar ni marcar nada a mano.
 */
export function useCrmPeriodDimensions(period: string | null) {
  const [loaded, setResult] = useState<{ period: string; rows: CrmDimensionRow[] } | null>(null);

  useEffect(() => {
    if (!period) return;

    let active = true;
    crmApi.getDimensions(period)
      .then((result) => { if (active) setResult({ period, rows: result.dimensions ?? [] }); })
      .catch(() => { if (active) setResult({ period, rows: [] }); });

    return () => { active = false; };
  }, [period]);

  const current = period && loaded?.period === period ? loaded : null;
  return { rows: current?.rows ?? NO_ROWS, loading: Boolean(period) && !current };
}
