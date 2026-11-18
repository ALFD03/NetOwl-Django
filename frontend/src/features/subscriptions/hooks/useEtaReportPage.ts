/** El reporte de la reguladora con sus acciones: bloquear el mes y fijar o consultar la tasa del BCV. */

import { useState } from 'react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';

import type { SubscriptionEtaReportResponse } from '../types';
import { useSubscriptionEtaReport } from './useSubscriptionEtaReport';

export function useEtaReportPage(etaData: SubscriptionEtaReportResponse) {
  const [saving, setSaving] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(etaData?.period ?? '');
  const { data, loading, fetchReport, setData } = useSubscriptionEtaReport(
    etaData ?? null,
    selectedPeriod,
  );

  const toggleLock = async () => {
    setSaving(true);
    try {
      await subscriptionsApi.lockEtaReport({ period: selectedPeriod, lock: !data.is_locked });
      fetchReport(selectedPeriod, true);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Guarda la tasa del mes y la refleja sin recargar el reporte.
   *
   * Cambiar la tasa no cambia el reporte: los formularios guardan el precio en
   * divisa y la conversión a bolívares la hace el exportador. Por eso se
   * actualiza el estado local en vez de volver a pedir el periodo entero, que
   * en un mes sin bloquear es el pipeline completo.
   */
  const changeRate = async (rate: number) => {
    const response = await subscriptionsApi.setEtaRate({ period: selectedPeriod, rate });
    setData({
      ...data,
      bcv_rate: response.bcv_rate,
      bcv_rate_source: response.bcv_rate_source,
      bcv_rate_warning: '',
    });
  };

  /**
   * Vuelve a pedirle la tasa al BCV.
   *
   * El fallo se guarda como aviso en vez de propagarse: el servicio de tasas
   * es un tercero, que esté caído no rompe el reporte, y el motivo —no se pudo
   * contactar, o el BCV no publicó esos días— es lo que dice si hay que
   * reintentar o escribirla a mano.
   */
  const fetchRate = async () => {
    try {
      const response = await subscriptionsApi.fetchEtaRate(selectedPeriod);
      setData({
        ...data,
        bcv_rate: response.bcv_rate,
        bcv_rate_source: response.bcv_rate_source,
        bcv_rate_warning: '',
      });
    } catch (error) {
      setData({
        ...data,
        bcv_rate_warning: getApiErrorMessage(error, 'No se pudo consultar la tasa del BCV.'),
      });
    }
  };

  return {
    data,
    loading,
    saving,
    selectedPeriod,
    setSelectedPeriod,
    toggleLock,
    changeRate,
    fetchRate,
  };
}
