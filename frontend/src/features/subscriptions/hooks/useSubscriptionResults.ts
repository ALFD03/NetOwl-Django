/** Carga el detalle de un periodo cuando se abre su modal. */

import { useEffect, useState } from 'react';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import type { SubscriptionResultsResponse } from '@/features/subscriptions/types';

/**
 * La respuesta se guarda con el periodo al que pertenece y `loading` se deriva
 * de ahí: mientras llega la de otro periodo no se enseña el detalle del
 * anterior, y el efecto no tiene que vaciar ni marcar nada a mano.
 */
export function useSubscriptionResults(period: string | null) {
  const [resultado, setResultado] = useState<{
    period: string;
    data: SubscriptionResultsResponse | null;
  } | null>(null);

  useEffect(() => {
    if (!period) return;

    let active = true;
    subscriptionsApi.getResultsDetails(period)
      .then((result) => { if (active) setResultado({ period, data: result }); })
      .catch(() => { if (active) setResultado({ period, data: null }); });

    return () => { active = false; };
  }, [period]);

  const vigente = period && resultado?.period === period ? resultado : null;
  return { data: vigente?.data ?? null, loading: Boolean(period) && !vigente };
}
