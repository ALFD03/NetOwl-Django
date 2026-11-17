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
  const [forzando, setForzando] = useState(false);
  const [fallido, setFallido] = useState<string | null>(null);

  // Ajuste en render: otro periodo olvida el fallo del anterior.
  const [periodoVisto, setPeriodoVisto] = useState(period);
  if (period !== periodoVisto) {
    setPeriodoVisto(period);
    setFallido(null);
  }

  const fetchReport = useCallback(async (selectedPeriod: string, force = false) => {
    if (!selectedPeriod) return;
    setForzando(true);
    try {
      const result = await subscriptionsApi.getEtaReport(selectedPeriod, force);
      setData(result);
    } finally {
      setForzando(false);
    }
  }, []);

  useEffect(() => {
    if (!period || period === data.periodo) return;

    let activo = true;
    subscriptionsApi.getEtaReport(period, false)
      .then((result) => { if (activo) setData(result); })
      .catch(() => { if (activo) setFallido(period); });

    return () => { activo = false; };
  }, [period, data.periodo]);

  const cambiandoDePeriodo = Boolean(period) && period !== data.periodo && fallido !== period;
  return { data, loading: forzando || cambiandoDePeriodo, fetchReport, setData };
}
