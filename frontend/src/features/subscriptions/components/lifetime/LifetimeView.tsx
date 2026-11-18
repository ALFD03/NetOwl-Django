/**
 * Lifetime de un mes: cuánto duraron activas las suscripciones que se dieron
 * de baja en él.
 *
 * Las bajas son las mismas que cuenta el churn mensual —activas al inicio del
 * mes que lo cierran sin estar activas—, y de cada una se mide cuánto duró
 * desde su instalación. Solo las instaladas desde 2026 y fuera de las campañas
 * excluidas: el resto se dice en el encabezado, pero no se mide. Todo lo de
 * esta página ya viene calculado; elegir otro mes solo vuelve a pedir la página.
 */

import { useState } from 'react';
import { Activity, Calendar, Clock, Loader2, RefreshCw, Timer } from 'lucide-react';

import { DIMENSION_CONFIG } from '@/shared/constants/labels';
import { subscriptionsApi } from '@/shared/lib/api/subscriptions';
import {
  Column, DataTable, EmptyState, MetricCard, NeonContainer, PeriodSelector, StatusMessage, StickyLabel, ToggleGroup,
} from '@/shared/ui';
import { useAsyncAction } from '@/shared/hooks/useAsyncAction';
import { formatInteger } from '@/shared/utils/formatters';
import { tierColor } from '../../charts/lifetimeChart';
import type { LifetimeDimensionRow, LifetimeMonth, LifetimeSummary } from '../../types';
import { LifetimeExportButton } from './LifetimeExportButton';
import { LifetimeTiersPanel } from './LifetimeTiersPanel';
import { useVisit } from '@/shared/page/PageData';

interface LifetimeViewProps {
  months: string[];
  period: string | null;
  lifetime: LifetimeMonth | null;
}

// El producto no se desglosa: el export guarda el plan de hoy, y el de casi
// todas las bajas es "Cancelado". `DIMENSION_CONFIG` es compartido, por eso se
// filtra aquí.
const DIMENSION_OPTIONS = Object.entries(DIMENSION_CONFIG)
  .filter(([key]) => key !== 'producto')
  .map(([key, config]) => ({ key, label: config.label, icon: config.icon }));

const formatDays = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${formatInteger(value)} d`;

/**
 * Un % de bajas tempranas con su barrita: el color va del verde al rojo según
 * pese más, para que la tabla se lea por color antes que por número.
 */
function PctTemprano({ pct }: { pct: number }) {
  // Un valor alto es malo: se fueron pronto. Se usa la rampa de los tramos al revés.
  const color = tierColor(Math.round((1 - Math.min(pct, 100) / 100) * 4), 5);
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-800 xl:block">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="w-12 text-right font-black tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

const DIMENSION_COLUMNS: Column<LifetimeDimensionRow>[] = [
  {
    header: 'Etiqueta',
    accessor: (r) => (
      <StickyLabel minWidth="140px">{r.value}</StickyLabel>
    ),
    sortKey: 'value',
    sticky: true,
  },
  { header: 'Bajas', accessor: (r) => formatInteger(r.churned), align: 'right', sortKey: 'churned' },
  {
    header: 'Mediana',
    accessor: (r) => <span className="font-black text-amber-400">{formatDays(r.median)}</span>,
    align: 'right',
    sortKey: 'median',
  },
  { header: 'Promedio', accessor: (r) => formatDays(r.mean), align: 'right', sortKey: 'mean' },
  {
    header: 'P25 – P75',
    accessor: (r) => <span className="text-slate-400">{formatDays(r.p25)} – {formatDays(r.p75)}</span>,
    align: 'right',
    sortKey: 'p25',
  },
  { header: 'Se fueron ≤ 30 d', accessor: (r) => <PctTemprano pct={r.pct_30} />, align: 'right', sortKey: 'pct_30' },
  { header: 'Se fueron ≤ 90 d', accessor: (r) => <PctTemprano pct={r.pct_90} />, align: 'right', sortKey: 'pct_90' },
];

function MeasureSummary({ summary, color }: { summary: LifetimeSummary; color: 'blue' }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="Promedio" value={formatDays(summary.mean)} color={color} />
      <MetricCard label="Mediana" value={formatDays(summary.median)} color={color} subValue="La mitad duró menos" />
      <MetricCard
        label="P25 – P75"
        value={`${formatDays(summary.p25)} – ${formatDays(summary.p75)}`}
        color="slate"
        subValue="La mitad central"
      />
      <MetricCard
        label="Mínimo – Máximo"
        value={`${formatDays(summary.min)} – ${formatDays(summary.max)}`}
        color="slate"
      />
    </div>
  );
}

export function LifetimeView({ months, period, lifetime }: LifetimeViewProps) {
  const visit = useVisit();
  const [activeDimension, setActiveDimension] = useState('sucursal');
  const activeLabel = DIMENSION_CONFIG[activeDimension]?.label ?? activeDimension;

  const recompute = useAsyncAction(subscriptionsApi.runLifetime, {
    successMessage: () => 'Lifetime recalculado.',
    errorMessage: 'No se pudo recalcular el lifetime.',
  });

  // Al terminar el job los datos de la página se vuelven a pedir solos.
  const handleRun = () => void recompute.run();

  const changeMonth = (mes: string) =>
    visit({ period: mes });

  const toolbar = (
    <div className="flex flex-wrap items-start gap-4">
      <PeriodSelector
        label="Mes de las bajas"
        icon={<Calendar className="h-4 w-4 text-brand" />}
        value={period ?? ''}
        options={months}
        onChange={changeMonth}
      />
      {lifetime && <LifetimeExportButton churn_month={lifetime.churn_month} />}
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={recompute.isPending}
          title="Vuelve a calcular todos los meses con los datos importados hoy."
          className="flex items-center gap-2 rounded-2xl bg-slate-800/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-lg transition-all hover:bg-brand hover:text-white disabled:opacity-60"
        >
          {recompute.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Recalcular
        </button>
        <StatusMessage status={recompute.status} />
      </div>
    </div>
  );

  if (!lifetime) {
    return (
      <div className="space-y-6">
        {toolbar}
        <EmptyState
          title="Todavía no hay lifetime calculado"
          description="Pulsa «Recalcular» para medir cuánto duraron activas las bajas de cada mes."
          icon={<Timer />}
          size="lg"
          bordered
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}

      <NeonContainer
        theme="blue"
        title="Tiempo activo desde la instalación"
        subtitle={`De la fecha de instalación a la baja, de las ${formatInteger(lifetime.churned)} bajas instaladas desde ${lifetime.installed_since}.`}
        icon={<Clock className="h-5 w-5" />}
      >
        <MeasureSummary summary={lifetime.summary} color="blue" />
      </NeonContainer>

      <LifetimeTiersPanel lifetime={lifetime} />

      <NeonContainer
        theme="slate"
        title={`Por ${activeLabel.toLowerCase()}`}
        subtitle="Las bajas del mes instaladas desde 2026. Rojo: una parte grande se fue en sus primeros días."
        icon={<Activity className="h-5 w-5" />}
        headerAction={
          <div className="rounded-2xl border border-slate-800 bg-surface-primary p-1">
            <ToggleGroup options={DIMENSION_OPTIONS} activeKey={activeDimension} onChange={setActiveDimension} />
          </div>
        }
        noPadding
      >
        <div className="h-[450px]">
          {(lifetime.by_dimension[activeDimension] ?? []).length === 0 ? (
            <EmptyState
              title="Ninguna baja de este mes se instaló desde 2026"
              icon={<Activity />}
              size="md"
            />
          ) : (
            <DataTable
              columns={DIMENSION_COLUMNS}
              data={lifetime.by_dimension[activeDimension] ?? []}
              searchable
              searchPlaceholder={`Buscar en ${activeLabel}...`}
            />
          )}
        </div>
      </NeonContainer>
    </div>
  );
}
