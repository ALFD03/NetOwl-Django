/** `/subscriptions/eta-report/`: el reporte de la reguladora. */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import { EtaReportToolbar } from '@/features/subscriptions/components/eta/EtaReportToolbar';
import { EtaReportView } from '@/features/subscriptions/components/eta/EtaReportView';
import { useSubscriptionEtaReport } from '@/features/subscriptions/hooks/useSubscriptionEtaReport';
import type { SubscriptionEtaReportResponse } from '@/features/subscriptions/types';

interface EtaReportProps {
  etaData: SubscriptionEtaReportResponse;
}

export default function EtaReport({ etaData }: EtaReportProps) {
  const [saving, setSaving] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(etaData?.period ?? '');
  const { data, loading, fetchReport, setData } = useSubscriptionEtaReport(etaData ?? null, selectedPeriod);

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
  const changeRate = async (tasa: number) => {
    const response = await subscriptionsApi.setEtaTasa({ period: selectedPeriod, rate: tasa });
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
      const response = await subscriptionsApi.consultarEtaTasa(selectedPeriod);
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

  return (
    <AppLayout
      toolbar={
        <>
          <EtaReportToolbar
            period={selectedPeriod}
            periods={data.periods ?? []}
            onPeriodChange={setSelectedPeriod}
            showLockToggle={data.status === 'success'}
            isLocked={Boolean(data.is_locked)}
            isSaving={saving}
            onToggleLock={toggleLock}
            forms={data.forms}
            withoutRegulatory={data.plans_without_regulator}
            rate={data.bcv_rate ?? 0}
            rateSource={data.bcv_rate_source}
            rateNotice={data.bcv_rate_warning}
            onRateChange={changeRate}
            onRateFetch={fetchRate}
          />
        </>
      }
    >
      <EtaReportView
        data={data}
        loading={loading}
        period={selectedPeriod}
        configLink={
          <Link
            to={`/subscriptions/eta-report/config/?period=${selectedPeriod}`}
            className="flex items-center gap-2 rounded-2xl bg-amber-500 px-10 py-3.5 text-xs font-black uppercase tracking-widest text-surface-primary shadow-xl shadow-amber-500/30 transition-all hover:bg-amber-400"
          >
            Ir a Panel de Clasificación <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />
    </AppLayout>
  );
}
