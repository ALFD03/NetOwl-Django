/** Estado del reporte ETA: recarga un periodo y permite forzar el recálculo. */

import { useCallback, useEffect, useState } from 'react';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import type { SubscriptionEtaReportResponse } from '@/features/subscriptions/types';

/**
 * Hay dos cargas y no se anuncian igual:
 *
 * - la de cambiar de periodo se deriva —el periodo pedido no es el que hay en
 *   `data`—, así que el efecto no tiene que marcar nada antes de pedirlo;
 * - la forzada (recalcular, bloquear) la lanza el usuario, y esa sí lleva su
 *   propio indicador.
 *
 * Un periodo que no responde se recuerda como fallido para no quedarse
 * "cargando" para siempre; elegir otro y volver lo reintenta.
 */
export function useSubscriptionEtaReport(initialData: SubscriptionEtaReportResponse | null, period: string) {
  const [data, setData] = useState<SubscriptionEtaReportResponse>(initialData ?? {} as SubscriptionEtaReportResponse);
  const [forcing, setForcing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Ajuste en render: otro periodo olvida el fallo del anterior.
  const [viewedPeriod, setViewedPeriod] = useState(period);
  if (period !== viewedPeriod) {
    setViewedPeriod(period);
    setFailed(null);
  }

  const fetchReport = useCallback(async (selectedPeriod: string, force = false) => {
    if (!selectedPeriod) return;
    setForcing(true);
    try {
      const result = await subscriptionsApi.getEtaReport(selectedPeriod, force);
      setData(result);
    } finally {
      setForcing(false);
    }
  }, []);

  useEffect(() => {
    if (!period || period === data.period) return;

    let active = true;
    subscriptionsApi.getEtaReport(period, false)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setFailed(period); });

    return () => { active = false; };
  }, [period, data.period]);

  const changingPeriod = Boolean(period) && period !== data.period && failed !== period;
  return { data, loading: forcing || changingPeriod, fetchReport, setData };
}
