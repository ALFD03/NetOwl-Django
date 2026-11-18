/** `/subscriptions/eta-report/`: el reporte de la reguladora. */

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { EtaReportToolbar } from '@/features/subscriptions/components/eta/EtaReportToolbar';
import { EtaReportView } from '@/features/subscriptions/components/eta/EtaReportView';
import { useEtaReportPage } from '@/features/subscriptions/hooks/useEtaReportPage';
import type { SubscriptionEtaReportResponse } from '@/features/subscriptions/types';

interface EtaReportProps {
  etaData: SubscriptionEtaReportResponse;
}

export default function EtaReport({ etaData }: EtaReportProps) {
  const { data, loading, saving, selectedPeriod, setSelectedPeriod, toggleLock, changeRate, fetchRate } =
    useEtaReportPage(etaData);

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
