import { useState } from 'react';
import { Link } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { ModuleHeader } from '@/shared/navigation/ModuleHeader';
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
  const { data, loading, fetchReport } = useSubscriptionEtaReport(etaData ?? null, selectedPeriod);

  const toggleLock = async () => {
    setSaving(true);
    try {
      await subscriptionsApi.lockEtaReport({ period: selectedPeriod, lock: !data.esta_bloqueado });
      fetchReport(selectedPeriod, true);
    } finally {
      setSaving(false);
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
