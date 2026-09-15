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
  CRM_ETAPA_LABELS_CORTAS,
  crmEtapaLabel,
} from '@/shared/constants/labels';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import { useCrmStageTime } from '../../hooks/useCrmStageTime';
import {
  formatHoras,
  formatVariacion,
  variacionColor,
  type CrmStageTimeCard,
  type CrmStageTimeDimensionRow,
} from '../../lib/crmTiempoEtapa';
import type { CrmDimensionValue, CrmHistoricoRow } from '../../types';

interface Props {
  globalData: CrmHistoricoRow;
  rows: CrmDimensionValue[];
  selectedDimension: string;
}

const VISTA_OPTIONS = [
  { key: 'clave', label: 'Etapas de venta' },
  { key: 'todas', label: 'Todas' },
];

/** Text colour per variation tone. Explicit, since Tailwind cannot see a build-up. */
const VARIACION_TEXT: Record<ReturnType<typeof variacionColor>, string> = {
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
    corte,
    isEmpty,
    selectedEtapa,
    setSelectedEtapa,
    verTodas,
    setVerTodas,
    baseline,
    dimensionRows,
    leaders,
  } = useCrmStageTime(globalData, rows);

  const dimensionLabel =
    CRM_DIMENSION_LABELS[selectedDimension as keyof typeof CRM_DIMENSION_LABELS] ??
    selectedDimension;

  const etapaOptions = cards.map((card) => ({
    key: card.etapa,
    label: CRM_ETAPA_LABELS_CORTAS[card.etapa] ?? card.label,
  }));

  return (
    <div className="space-y-6">
      <NeonContainer
        theme="cyan"
        title="Tiempo por Etapa"
        subtitle={
          corte
            ? `Suma de horas ÷ transiciones que salieron de la etapa · lo atascado se lista aparte, medido hasta ${formatCorte(corte)}`
            : 'Suma de horas ÷ transiciones que salieron de la etapa'
        }
        icon={<Hourglass className="h-5 w-5" />}
        headerAction={
          <ToggleGroup
            options={VISTA_OPTIONS}
            activeKey={verTodas ? 'todas' : 'clave'}
            onChange={(key) => setVerTodas(key === 'todas')}
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
              <StageTimeCard key={card.etapa} card={card} />
            ))}
          </div>
        )}
      </NeonContainer>

      {!isEmpty && (
        <NeonContainer
          theme="purple"
          title={`${crmEtapaLabel(selectedEtapa)} por ${dimensionLabel}`}
          subtitle={`Referencia del periodo: ${formatHoras(baseline)} · la variación se mide contra ella · cada oportunidad va a su dimensión por Iniciativa/ID`}
          icon={<Gauge className="h-5 w-5" />}
          headerAction={
            <ToggleGroup
              className="flex-wrap justify-end"
              options={etapaOptions}
              activeKey={selectedEtapa}
              onChange={setSelectedEtapa}
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
              row={leaders.rapida}
              emptyMessage="Ningún valor alcanza la muestra mínima"
            />
            <LeaderTile
              icon={<Snail className="h-4 w-4 text-rose-400" />}
              label={`${dimensionLabel} más lenta`}
              row={leaders.lenta}
              emptyMessage={
                leaders.rapida
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
function formatCorte(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;

  return fecha.toLocaleString('es-VE', {
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
  if (card.muestra === 0) {
    return (
      <MetricCard
        label={card.label}
        value="—"
        color="slate"
        // A stage whose every move was written and undone in the same instant
        // did have activity; what it did not have is a stay to measure.
        subValue={
          card.nulos > 0
            ? `${formatInteger(card.nulos)} movimientos de duración cero`
            : 'Sin actividad en el periodo'
        }
      />
    );
  }

  return (
    <MetricCard
      label={card.label}
      value={formatHoras(card.promedio)}
      color={card.accent}
      subValue={`Mediana ${formatHoras(card.mediana)} · P75 ${formatHoras(card.p75)}`}
      caption={
        card.fiable
          ? `${formatHoras(card.sumaHoras)} ÷ ${formatInteger(card.muestra)} salidas`
          : `Muestra corta: ${formatInteger(card.muestra)} salidas`
      }
      indicator={card.fiable}
    >
      {card.sinSalida > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase text-amber-500/80">
            Fuera del promedio: {formatInteger(card.sinSalida)} sin salir
          </p>
          <p className="text-[9px] font-bold uppercase text-slate-500">
            Llevan {formatHoras(card.horasSinSalida)} ·{' '}
            {formatInteger(card.sinSalidaAbiertas)} abiertas ·{' '}
            {formatInteger(card.sinSalidaCerradas)} cerradas aquí
          </p>
        </>
      )}

      <p className="pt-1 text-[9px] font-bold uppercase text-slate-500">Destino de las salidas</p>
      <ProgressBar
        label={`Avanzaron (${formatHoras(card.horasAvance)})`}
        percent={card.pctAvance}
        valueLabel={`${formatTwoDecimals(card.pctAvance)}%`}
        color="green"
      />
      <ProgressBar
        label={`Devueltos a E8 (${formatHoras(card.horasDevolucion)})`}
        percent={card.pctDevolucion}
        valueLabel={`${formatTwoDecimals(card.pctDevolucion)}%`}
        color="red"
      />
      <ProgressBar
        label="Retornaron a una etapa anterior"
        percent={card.pctRetorno}
        valueLabel={`${formatTwoDecimals(card.pctRetorno)}%`}
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
        value={row ? row.valor : '—'}
        caption={
          row
            ? `${formatHoras(row.promedio)} · ${formatVariacion(row.variacionPct)} vs. el periodo · ${formatInteger(row.muestra)} medidas`
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
      <span className={r.fiable ? 'font-bold text-white' : 'text-slate-500'} title={r.valor}>
        {r.valor}
      </span>
    ),
    sortKey: 'valor',
  },
  {
    header: 'Promedio',
    accessor: (r) => <span className="font-bold text-white">{formatHoras(r.promedio)}</span>,
    align: 'right',
    sortKey: 'promedio',
  },
  {
    header: 'vs. Periodo',
    accessor: (r) => (
      <span className={`font-bold ${VARIACION_TEXT[variacionColor(r.variacionPct)]}`}>
        {formatVariacion(r.variacionPct)}
      </span>
    ),
    align: 'right',
    sortKey: 'variacionPct',
  },
  { header: 'Mediana', accessor: (r) => formatHoras(r.mediana), align: 'right', sortKey: 'mediana' },
  { header: 'P75', accessor: (r) => formatHoras(r.p75), align: 'right', sortKey: 'p75' },
  {
    header: 'Horas totales',
    accessor: (r) => formatHoras(r.sumaHoras),
    align: 'right',
    sortKey: 'sumaHoras',
  },
  {
    header: 'Salidas',
    accessor: (r) => formatInteger(r.movimientos),
    align: 'right',
    sortKey: 'movimientos',
  },
  {
    header: 'Sin salir (fuera)',
    accessor: (r) => <span className="text-amber-400">{formatInteger(r.sinSalida)}</span>,
    align: 'right',
    sortKey: 'sinSalida',
  },
  {
    header: 'Sin salir %',
    accessor: (r) => <span className="text-amber-400">{formatTwoDecimals(r.pctSinSalida)}%</span>,
    align: 'right',
    sortKey: 'pctSinSalida',
  },
  // The three below share a different denominator — the exits alone — so the
  // header carries it: read against `Medidas` they do not add up to anything.
  {
    header: 'Avance % (salidas)',
    accessor: (r) => <span className="text-emerald-400">{formatTwoDecimals(r.pctAvance)}%</span>,
    align: 'right',
    sortKey: 'pctAvance',
  },
  {
    header: 'Dev. E8 % (salidas)',
    accessor: (r) => <span className="text-rose-400">{formatTwoDecimals(r.pctDevolucion)}%</span>,
    align: 'right',
    sortKey: 'pctDevolucion',
  },
  {
    header: 'Otras % (salidas)',
    accessor: (r) => <span className="text-slate-400">{formatTwoDecimals(r.pctOtro)}%</span>,
    align: 'right',
    sortKey: 'pctOtro',
  },
];
