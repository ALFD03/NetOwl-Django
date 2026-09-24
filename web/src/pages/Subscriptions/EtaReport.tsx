/** Página Inertia `Subscriptions/EtaReport` (`/subscriptions/eta-report/`): el reporte de la reguladora. */

import { useState } from 'react';
import { Link } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
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
  const [selectedPeriod, setSelectedPeriod] = useState(etaData?.periodo ?? '');
  const { data, loading, fetchReport, setData } = useSubscriptionEtaReport(etaData ?? null, selectedPeriod);

  const toggleLock = async () => {
    setSaving(true);
    try {
      await subscriptionsApi.lockEtaReport({ period: selectedPeriod, lock: !data.esta_bloqueado });
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
  const cambiarTasa = async (tasa: number) => {
    const respuesta = await subscriptionsApi.setEtaTasa({ period: selectedPeriod, tasa });
    setData({
      ...data,
      tasa_bcv: respuesta.tasa_bcv,
      tasa_bcv_fuente: respuesta.tasa_bcv_fuente,
      tasa_bcv_aviso: '',
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
  const consultarTasa = async () => {
    try {
      const respuesta = await subscriptionsApi.consultarEtaTasa(selectedPeriod);
      setData({
        ...data,
        tasa_bcv: respuesta.tasa_bcv,
        tasa_bcv_fuente: respuesta.tasa_bcv_fuente,
        tasa_bcv_aviso: '',
      });
    } catch (error) {
      setData({
        ...data,
        tasa_bcv_aviso: getApiErrorMessage(error, 'No se pudo consultar la tasa del BCV.'),
      });
    }
  };

  return (
    <AppLayout
      title="Reporte Regulatorio ETA"
      toolbar={
        <>
          <ModuleHeader module="subscriptions" activeTab="eta" />
          <EtaReportToolbar
            period={selectedPeriod}
            periods={data.periods ?? []}
            onPeriodChange={setSelectedPeriod}
            showLockToggle={data.status === 'success'}
            isLocked={Boolean(data.esta_bloqueado)}
            isSaving={saving}
            onToggleLock={toggleLock}
            formularios={data.formularios}
            sinRegulador={data.planes_sin_regulador}
            tasa={data.tasa_bcv ?? 0}
            tasaFuente={data.tasa_bcv_fuente}
            tasaAviso={data.tasa_bcv_aviso}
            onTasaChange={cambiarTasa}
            onTasaConsultar={consultarTasa}
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
            href={`/subscriptions/eta-report/config/?period=${selectedPeriod}`}
            className="flex items-center gap-2 rounded-2xl bg-amber-500 px-10 py-3.5 text-xs font-black uppercase tracking-widest text-surface-primary shadow-xl shadow-amber-500/30 transition-all hover:bg-amber-400"
          >
            Ir a Panel de Clasificación <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />
    </AppLayout>
  );
}
