import { useMemo, useState } from 'react';
import { Activity, Clock, Loader2, RefreshCw } from 'lucide-react';

import { LineChart } from '@/shared/charts';
import { DIMENSION_CONFIG } from '@/shared/constants/labels';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import {
  Column, DataTable, MetricCard, MilestoneTimeline, NeonContainer, StatusMessage, ToggleGroup,
} from '@/shared/ui';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { formatInteger } from '@/shared/utils/formatters';
import {
  buildSurvivalChartData, censorshipRate, firstYearSurvival, survivalChartOptions,
} from '../../charts/lifetimeChart';
import type { LifetimeData, LifetimeDimensionInfo } from '../../types';

interface LifetimeViewProps {
  lifecycle?: LifetimeData;
  dimensiones?: Record<string, Record<string, LifetimeDimensionInfo>>;
}

type DimensionRow = LifetimeDimensionInfo & { valor: string };

const DIMENSION_OPTIONS = Object.entries(DIMENSION_CONFIG).map(([key, config]) => ({
  key,
  label: config.label,
  icon: config.icon,
}));

/** Reference lifetime used to scale the median bar, in days. */
const MEDIAN_BAR_SCALE = 400;

const DIMENSION_COLUMNS: Column<DimensionRow>[] = [
  {
    header: 'Etiqueta',
    accessor: (r) => (
      <span className="sticky left-0 z-10 block min-w-[140px] bg-surface-secondary pr-4 font-bold text-white">
        {r.valor}
      </span>
    ),
    sortKey: 'valor',
  },
  { header: 'Muestra Total', accessor: (r) => formatInteger(r.n_total_activo), align: 'right', sortKey: 'n_total_activo' },
  { header: 'Baja Temprana (P25)', accessor: (r) => `${formatInteger(r.p25_activo)} d`, align: 'right', sortKey: 'p25_activo' },
  {
    header: 'Vida Media (P50)',
    accessor: (r) => (
      <div className="flex items-center justify-end gap-3">
        <span className="font-black text-blue-400">{formatInteger(r.mediana_activo)} d</span>
        <div className="hidden h-1 w-16 overflow-hidden rounded-full bg-slate-800 xl:block">
          <div
            className="h-full bg-brand"
            style={{ width: `${Math.min((Number(r.mediana_activo ?? 0) / MEDIAN_BAR_SCALE) * 100, 100)}%` }}
          />
        </div>
      </div>
    ),
    align: 'right',
    sortKey: 'mediana_activo',
  },
  { header: 'Fidelización (P75)', accessor: (r) => `${formatInteger(r.p75_activo)} d`, align: 'right', sortKey: 'p75_activo' },
  {
    header: 'Tasa Reactivación',
    accessor: (r) => r.mediana_reactivacion
      ? <span className="text-amber-400">{formatInteger(r.mediana_reactivacion)} d</span>
      : <span className="text-slate-600">--</span>,
    align: 'right',
    sortKey: 'mediana_reactivacion',
  },
];

export function LifetimeView({ lifecycle, dimensiones }: LifetimeViewProps) {
  const [activeDimension, setActiveDimension] = useState('sucursal');

  const data = useMemo(() => lifecycle ?? ({} as LifetimeData), [lifecycle]);
  const dims = useMemo(() => dimensiones ?? {}, [dimensiones]);
  const activeLabel = DIMENSION_CONFIG[activeDimension]?.label ?? activeDimension;

  const chartData = useMemo(
    () => buildSurvivalChartData(data, dims[activeDimension] ?? {}),
    [data, dims, activeDimension],
  );

  const dimensionRows = useMemo<DimensionRow[]>(
    () => Object.entries(dims[activeDimension] ?? {}).map(([valor, info]) => ({ valor, ...info })),
    [dims, activeDimension],
  );

  const recompute = useAsyncAction(subscriptionsApi.runLifetime, {
    successMessage: () => 'Motor Kaplan-Meier actualizado.',
    errorMessage: 'No se pudo actualizar el motor Kaplan-Meier.',
  });

  const handleRun = async () => {
    const result = await recompute.run();
    if (result !== undefined) window.location.reload();
  };

  const milestones = [
    { id: 'p25', label: 'Baja Temprana (25%)', value: formatInteger(data.p25_activo), unit: 'días', markerClass: 'bg-rose-500' },
    { id: 'p50', label: 'Punto Crítico (50%)', value: formatInteger(data.mediana_activo), unit: 'días', markerClass: 'bg-brand' },
    { id: 'p75', label: 'Fidelización (75%)', value: formatInteger(data.p75_activo), unit: 'días', markerClass: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Vida Media (50%)" value={`${formatInteger(data.mediana_activo)} días`} color="blue" subValue="Expectativa de permanencia" />
        <MetricCard label="Supervivencia 1er Año" value={`${firstYearSurvival(data)}%`} color="green" />
        <MetricCard label="Tasa de Censura" value={`${censorshipRate(data)}%`} color="yellow" subValue="Clientes que no han cancelado" />
        <MetricCard label="Muestra Total" value={formatInteger(data.n_total_activo ?? data.total_suscriptores)} color="slate" subValue="Histórico analizado" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <NeonContainer theme="blue" title="Timeline de Deserción" icon={<Clock className="h-5 w-5" />}>
            <MilestoneTimeline milestones={milestones} />

            <StatusMessage status={recompute.status} className="mb-3" />

            <button
              type="button"
              onClick={handleRun}
              disabled={recompute.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800/80 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-lg transition-all hover:bg-brand hover:text-white disabled:opacity-60"
            >
              {recompute.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Actualizar Motor KM
            </button>
          </NeonContainer>
        </div>

        <div className="lg:col-span-3">
          <NeonContainer theme="cyan" title={`Análisis de Supervivencia: ${activeLabel}`} icon={<Activity className="h-5 w-5" />}>
            <LineChart data={chartData} options={survivalChartOptions} className="h-80 w-full" />
          </NeonContainer>
        </div>
      </div>

      <NeonContainer
        theme="slate"
        title={`Rendimiento por ${activeLabel}`}
        icon={<Activity className="h-5 w-5" />}
        headerAction={
          <div className="rounded-2xl border border-slate-800 bg-surface-primary p-1">
            <ToggleGroup options={DIMENSION_OPTIONS} activeKey={activeDimension} onChange={setActiveDimension} />
          </div>
        }
        noPadding
      >
        <div className="h-[450px]">
          <DataTable
            columns={DIMENSION_COLUMNS}
            data={dimensionRows}
            searchable
            searchPlaceholder={`Buscar en ${activeLabel}...`}
          />
        </div>
      </NeonContainer>
    </div>
  );
}
