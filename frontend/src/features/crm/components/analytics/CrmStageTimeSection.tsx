/** El tiempo por etapa: promedio crudo y ajustado, desenlaces y estancias en curso. */

import type { ReactNode } from 'react';
import { Gauge, Hourglass, Rabbit, Snail } from 'lucide-react';

import {
  type Column,
  DataTable,
  EmptyState,
  MetricCard,
  NeonContainer,
  ProgressBar,
  StatTile,
  ToggleGroup,
} from '@/shared/ui';
import {
  CRM_DIMENSION_LABELS,
  CRM_STAGE_SHORT_LABELS,
  crmStageLabel,
} from '@/shared/constants/labels';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useCrmStageTime } from '../../hooks/useCrmStageTime';
import {
  formatHours,
  formatChange,
  changeColor,
  type CrmStageTimeCard,
  type CrmStageTimeDimensionRow,
} from '../../lib/crmStageTime';
import type { CrmDimensionValue, CrmHistoricoRow } from '../../types';

interface Props {
  globalData: CrmHistoricoRow;
  rows: CrmDimensionValue[];
  selectedDimension: string;
}

const VIEW_OPTIONS = [
  { key: 'clave', label: 'Etapas de venta' },
  { key: 'todas', label: 'Todas' },
];

/** Text colour per variation tone. Explicit, since Tailwind cannot see a build-up. */
const CHANGE_TEXT: Record<ReturnType<typeof changeColor>, string> = {
  green: 'text-emerald-400',
  red: 'text-rose-400',
  slate: 'text-slate-300',
  blue: 'text-sky-400',
  yellow: 'text-amber-400',
  purple: 'text-purple-400',
};

/**
 * How long an opportunity sits in each stage, and how that time moves across the
 * selected dimension.
 *
 * Two readings, deliberately kept apart: the cards are the period's own figure
 * per stage — the baseline — and the breakdown below is one stage seen across
 * every branch, campaign or seller, expressed as a distance from that baseline.
 */
export function CrmStageTimeSection({ globalData, rows, selectedDimension }: Props) {
  const {
    cards,
    cut,
    isEmpty,
    selectedStage,
    setSelectedStage,
    showAll,
    setShowAll,
    baseline,
    dimensionRows,
    leaders,
  } = useCrmStageTime(globalData, rows);

  const dimensionLabel =
    CRM_DIMENSION_LABELS[selectedDimension as keyof typeof CRM_DIMENSION_LABELS] ??
    selectedDimension;

  const stageOptions = cards.map((card) => ({
    key: card.stage,
    label: CRM_STAGE_SHORT_LABELS[card.stage] ?? card.label,
  }));

  return (
    <div className="space-y-6">
      <NeonContainer
        theme="cyan"
        title="Tiempo por Etapa"
        subtitle={
          cut
            ? `Suma de horas ÷ transiciones que salieron de la etapa · lo atascado se lista aparte, medido hasta ${formatCutoff(cut)}`
            : 'Suma de horas ÷ transiciones que salieron de la etapa'
        }
        icon={<Hourglass className="h-5 w-5" />}
        headerAction={
          <ToggleGroup
            options={VIEW_OPTIONS}
            activeKey={showAll ? 'todas' : 'clave'}
            onChange={(key) => setShowAll(key === 'todas')}
          />
        }
      >
        {isEmpty ? (
          <EmptyState
            title="No hay tiempos por etapa para el periodo seleccionado."
            description="Los periodos analizados antes de esta versión no los tienen guardados en el cierre; vuelve a ejecutar el análisis del CRM para ese mes."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {cards.map((card) => (
              <StageTimeCard key={card.stage} card={card} />
            ))}
          </div>
        )}
      </NeonContainer>

      {!isEmpty && (
        <NeonContainer
          theme="purple"
          title={`${crmStageLabel(selectedStage)} por ${dimensionLabel}`}
          subtitle={`Referencia del periodo: ${formatHours(baseline)} · la variación se mide contra ella · cada oportunidad va a su dimensión por Iniciativa/ID`}
          icon={<Gauge className="h-5 w-5" />}
          headerAction={
            <ToggleGroup
              className="lg:justify-end"
              options={stageOptions}
              activeKey={selectedStage}
              onChange={setSelectedStage}
            />
          }
        >
          <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <LeaderTile
              icon={<Rabbit className="h-4 w-4 text-emerald-400" />}
              label={
                leaders.comparable
                  ? `${dimensionLabel} más rápida`
                  : `Única ${dimensionLabel.toLowerCase()} con muestra`
              }
              row={leaders.fast}
              emptyMessage="Ningún valor alcanza la muestra mínima"
            />
            <LeaderTile
              icon={<Snail className="h-4 w-4 text-rose-400" />}
              label={`${dimensionLabel} más lenta`}
              row={leaders.slow}
              emptyMessage={
                leaders.fast
                  ? 'Un solo valor alcanza la muestra mínima: no hay con qué contrastarlo'
                  : 'Ningún valor alcanza la muestra mínima'
              }
            />
          </div>

          <div className="h-[420px]">
            <DataTable
              columns={STAGE_TIME_COLUMNS}
              data={dimensionRows}
              searchable
              searchPlaceholder={`Buscar ${dimensionLabel.toLowerCase()}...`}
              emptyMessage="Ningún valor de esta dimensión pasó por la etapa en el periodo."
            />
          </div>
        </NeonContainer>
      )}
    </div>
  );
}

/** `2026-08-28T12:00` -> `28/08 12:00`, enough to date the open stays. */
function formatCutoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The period's own figure for one stage.
 *
 * The first bar is the share of the measurement that has not left the stage
 * yet; the three below it split the exits alone, so they are shares of a
 * different base and are labelled as such rather than stacked with the first.
 */
function StageTimeCard({ card }: { card: CrmStageTimeCard }) {
  if (card.sample === 0) {
    return (
      <MetricCard
        label={card.label}
        value="—"
        color="slate"
        // A stage whose every move was written and undone in the same instant
        // did have activity; what it did not have is a stay to measure.
        subValue={
          card.nulls > 0
            ? `${formatInteger(card.nulls)} movimientos de duración cero`
            : 'Sin actividad en el periodo'
        }
      />
    );
  }

  return (
    <MetricCard
      label={card.label}
      value={formatHours(card.avg)}
      color={card.accent}
      subValue={`Mediana ${formatHours(card.median)} · P75 ${formatHours(card.p75)}`}
      caption={
        card.reliable
          ? `${formatHours(card.hoursTotal)} ÷ ${formatInteger(card.sample)} salidas`
          : `Muestra corta: ${formatInteger(card.sample)} salidas`
      }
      indicator={card.reliable}
    >
      {card.noExit > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase text-amber-500/80">
            Fuera del promedio: {formatInteger(card.noExit)} sin salir
          </p>
          <p className="text-[9px] font-bold uppercase text-slate-500">
            Llevan {formatHours(card.noExitHours)} ·{' '}
            {formatInteger(card.noExitOpen)} abiertas ·{' '}
            {formatInteger(card.noExitClosed)} cerradas aquí
          </p>
        </>
      )}

      <p className="pt-1 text-[9px] font-bold uppercase text-slate-500">Destino de las salidas</p>
      <ProgressBar
        label={`Avanzaron (${formatHours(card.advanceHours)})`}
        percent={card.pctProgress}
        valueLabel={`${formatTwoDecimals(card.pctProgress)}%`}
        color="green"
      />
      <ProgressBar
        label={`Devueltos a E8 (${formatHours(card.returnHours)})`}
        percent={card.pctReturns}
        valueLabel={`${formatTwoDecimals(card.pctReturns)}%`}
        color="red"
      />
      <ProgressBar
        label="Retornaron a una etapa anterior"
        percent={card.pctComeback}
        valueLabel={`${formatTwoDecimals(card.pctComeback)}%`}
        color="purple"
      />
    </MetricCard>
  );
}

function LeaderTile({
  icon,
  label,
  row,
  emptyMessage,
}: {
  icon: ReactNode;
  label: string;
  row: CrmStageTimeDimensionRow | null;
  emptyMessage: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="shrink-0">{icon}</div>
      <StatTile
        label={label}
        value={row ? row.value : '—'}
        caption={
          row
            ? `${formatHours(row.avg)} · ${formatChange(row.changePct)} vs. el periodo · ${formatInteger(row.sample)} medidas`
            : emptyMessage
        }
        size="md"
        className="min-w-0 flex-1"
      />
    </div>
  );
}

/**
 * The stage read across the dimension. Sorted fastest-first by default, so the
 * variation column reads as a ramp from who is ahead to who is holding it up.
 */
const STAGE_TIME_COLUMNS: Column<CrmStageTimeDimensionRow>[] = [
  {
    header: 'Valor',
    accessor: (r) => (
      <span className={r.reliable ? 'font-bold text-white' : 'text-slate-500'} title={r.value}>
        {r.value}
      </span>
    ),
    sortKey: 'value',
  },
  {
    header: 'Promedio',
    accessor: (r) => <span className="font-bold text-white">{formatHours(r.avg)}</span>,
    align: 'right',
    sortKey: 'avg',
  },
  {
    header: 'vs. Periodo',
    accessor: (r) => (
      <span className={`font-bold ${CHANGE_TEXT[changeColor(r.changePct)]}`}>
        {formatChange(r.changePct)}
      </span>
    ),
    align: 'right',
    sortKey: 'changePct',
  },
  { header: 'Mediana', accessor: (r) => formatHours(r.median), align: 'right', sortKey: 'median' },
  { header: 'P75', accessor: (r) => formatHours(r.p75), align: 'right', sortKey: 'p75' },
  {
    header: 'Horas totales',
    accessor: (r) => formatHours(r.hoursTotal),
    align: 'right',
    sortKey: 'hoursTotal',
  },
  {
    header: 'Salidas',
    accessor: (r) => formatInteger(r.movements),
    align: 'right',
    sortKey: 'movements',
  },
  {
    header: 'Sin salir (fuera)',
    accessor: (r) => <span className="text-amber-400">{formatInteger(r.noExit)}</span>,
    align: 'right',
    sortKey: 'noExit',
  },
  {
    header: 'Sin salir %',
    accessor: (r) => <span className="text-amber-400">{formatTwoDecimals(r.pctNoExit)}%</span>,
    align: 'right',
    sortKey: 'pctNoExit',
  },
  // The three below share a different denominator — the exits alone — so the
  // header carries it: read against `Medidas` they do not add up to anything.
  {
    header: 'Avance % (salidas)',
    accessor: (r) => <span className="text-emerald-400">{formatTwoDecimals(r.pctProgress)}%</span>,
    align: 'right',
    sortKey: 'pctProgress',
  },
  {
    header: 'Dev. E8 % (salidas)',
    accessor: (r) => <span className="text-rose-400">{formatTwoDecimals(r.pctReturns)}%</span>,
    align: 'right',
    sortKey: 'pctReturns',
  },
  {
    header: 'Otras % (salidas)',
    accessor: (r) => <span className="text-slate-400">{formatTwoDecimals(r.pctOther)}%</span>,
    align: 'right',
    sortKey: 'pctOther',
  },
];
