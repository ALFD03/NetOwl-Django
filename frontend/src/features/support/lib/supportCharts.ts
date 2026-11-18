/**
 * Los gráficos de Support Analytics, armados desde los bloques de métricas.
 *
 * Analytics es para ver el mes de un vistazo y qué lo empuja; las tablas
 * completas viven en Results. Por eso cada eje se dibuja con sus valores más
 * grandes (`VALUES_CAP`) y el resto se nombra, no se esconde.
 */

import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';

import { CHART_CHROME, CHART_PALETTE, METRIC_COLOR } from '@/shared/constants/theme';
import { formatInteger, formatOneDecimal, formatTwoDecimals, toNumber } from '@/shared/utils';
import type {
  SupportDimensionEntry,
  SupportDimensionRow,
  SupportStats,
  SupportTimeMeasure,
  SupportZoneRow,
} from '../types';
import { KIND_COLOR, KIND_LABEL, formatDuration } from './flowFormat';

/** Cuántos valores de un eje entran en un gráfico antes de pasar a «y N más». */
export const VALUES_CAP = 15;

const TOOLTIP = {
  backgroundColor: CHART_CHROME.surfaceDeep,
  titleColor: CHART_CHROME.textStrong,
  bodyColor: CHART_CHROME.textMuted,
  borderColor: CHART_CHROME.border,
  borderWidth: 1,
  padding: 12,
  cornerRadius: 8,
};

const LEGEND = {
  display: true,
  position: 'bottom' as const,
  labels: { color: CHART_CHROME.textAxis, boxWidth: 10, font: { size: 10 }, padding: 14 },
};

const CATEGORY_AXIS = {
  grid: { display: false },
  ticks: { color: CHART_CHROME.textMuted, font: { size: 11 }, autoSkip: false },
};

/** Alto de un gráfico de barras horizontales con `n` filas. */
export const barsHeight = (n: number) => Math.max(180, n * 30 + 70);

/** Recorta un nombre largo de Odoo para el eje, entero en el tooltip. */
const short = (text: string, max = 34) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// --- En qué se va el tiempo -------------------------------------------------

export const TIME_KINDS = ['cola', 'pausa', 'gestion', 'sin_clasificar'] as const;
export type TimeKind = (typeof TIME_KINDS)[number];

/** La clave de horas medias de cada tipo de etapa en el bloque de métricas. */
const HOURS_KEY = {
  cola: 'queue_hours',
  pausa: 'pause_hours',
  gestion: 'handling_hours',
  sin_clasificar: 'unclassified_hours',
} as const satisfies Record<TimeKind, keyof SupportStats>;

export interface TimePart {
  type: TimeKind;
  label: string;
  hours: number;
  pct: number;
  color: string;
}

/** Qué se hace en cada tipo de etapa, para el pie de su tarjeta. */
export const KIND_HELP: Record<TimeKind, string> = {
  cola: 'Esperando a que alguien lo tome',
  pausa: 'Esperando algo de fuera: cliente, pago, falla masiva',
  gestion: 'Alguien trabajando en él',
  sin_clasificar: 'Etapas que el catálogo aún no clasifica',
};

/** Las cuatro partes del tiempo medio del grupo, de lo cerrado con logs. */
export function timeParts(stats: SupportStats): { parts: TimePart[]; total: number } {
  const hoursOf = (kind: TimeKind) => toNumber(stats[HOURS_KEY[kind]]);
  const total = TIME_KINDS.reduce((acc, kind) => acc + hoursOf(kind), 0);
  const parts = TIME_KINDS.map((kind) => ({
    type: kind,
    label: KIND_LABEL[kind],
    hours: hoursOf(kind),
    pct: total > 0 ? Number(((hoursOf(kind) / total) * 100).toFixed(1)) : 0,
    color: KIND_COLOR[kind],
  })).filter((p) => p.hours > 0 || p.type !== 'sin_clasificar');
  return { parts, total };
}

export function timeDonutData(parts: TimePart[]): ChartData<'doughnut'> {
  return {
    labels: parts.map((p) => p.label),
    datasets: [
      {
        data: parts.map((p) => p.pct),
        backgroundColor: parts.map((p) => `${p.color}D9`),
        borderColor: CHART_CHROME.surfaceDeep,
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };
}

// --- Volumen por valor de un eje --------------------------------------------

/**
 * Lo de cada valor partido por su desenlace. Las cuatro partes suman su total:
 * resueltos + cancelados + escalados son lo cerrado en el mes, y «sin cerrar»
 * lo que entró y a la fecha seguía abierto.
 */
export function volumeByValueData(rows: SupportDimensionRow[]): ChartData<'bar'> {
  const visible = rows.slice(0, VALUES_CAP);
  const series = (label: string, color: string, value: (r: SupportDimensionRow) => number) => ({
    label,
    data: visible.map(value),
    backgroundColor: `${color}CC`,
    borderColor: color,
    borderWidth: 1,
    borderRadius: 3,
    stack: 'tickets',
    maxBarThickness: 22,
  });
  const hasEscalated = visible.some((r) => toNumber(r.tickets_escalated) > 0);

  return {
    labels: visible.map((r) => short(r.name)),
    datasets: [
      series('Resueltos', METRIC_COLOR.green, (r) => toNumber(r.tickets_resolved)),
      series('Cancelados', METRIC_COLOR.red, (r) => toNumber(r.tickets_cancelled)),
      ...(hasEscalated
        ? [series('Escalados a Soporte', METRIC_COLOR.yellow, (r) => toNumber(r.tickets_escalated))]
        : []),
      series('Sin cerrar', METRIC_COLOR.slate, (r) =>
        Math.max(0, toNumber(r.total_tickets) - toNumber(r.tickets_closed)),
      ),
    ],
  };
}

export function volumeByValueOptions(
  rows: SupportDimensionRow[],
  onSelect?: (index: number) => void,
): ChartOptions<'bar'> {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, elements) => {
      if (onSelect && elements.length) onSelect(elements[0].index);
    },
    onHover: (event, elements) => {
      const canvas = event.native?.target as HTMLCanvasElement | undefined;
      if (canvas) canvas.style.cursor = onSelect && elements.length ? 'pointer' : 'default';
    },
    interaction: { mode: 'index', axis: 'y', intersect: false },
    plugins: {
      legend: LEGEND,
      datalabels: { display: false },
      tooltip: {
        ...TOOLTIP,
        callbacks: {
          title: (items) => rows[items[0]?.dataIndex ?? 0]?.name ?? '',
          label: (ctx: TooltipItem<'bar'>) => ` ${ctx.dataset.label}: ${formatInteger(Number(ctx.raw))}`,
          footer: (items) => {
            const r = rows[items[0]?.dataIndex ?? 0];
            if (!r) return '';
            return [
              `${formatInteger(toNumber(r.total_tickets))} tickets · ${formatTwoDecimals(r.pctOfParent)}% del grupo`,
              `Resueltos ${formatTwoDecimals(toNumber(r.pct_resolved))}% de lo cerrado`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        grid: { color: CHART_CHROME.gridSoft },
        ticks: { color: CHART_CHROME.textAxis, font: { size: 10 } },
      },
      y: { stacked: true, ...CATEGORY_AXIS },
    },
  };
}

// --- Velas: cómo se reparte el tiempo de cada valor -------------------------

interface Candle {
  name: string;
  min: number;
  p25: number;
  median: number;
  average: number;
  p75: number;
  max: number;
  sample: number;
}

function candles(rows: SupportDimensionRow[], measure: SupportTimeMeasure): Candle[] {
  return rows
    .slice(0, VALUES_CAP)
    .map((r) => ({
      name: r.name,
      min: toNumber(r[`time_min_${measure}_hours`]),
      p25: toNumber(r[`time_p25_${measure}_hours`]),
      median: toNumber(r[`time_median_${measure}_hours`]),
      average: toNumber(r[`time_mean_${measure}_hours`]),
      p75: toNumber(r[`time_p75_${measure}_hours`]),
      max: toNumber(r[`time_max_${measure}_hours`]),
      sample: toNumber(r[`sample_${measure}`]),
    }))
    .filter((v) => v.sample > 0);
}

/**
 * El tope del eje: hasta donde llega la mayor de las mechas «razonables»
 * (p75 + 1,5 × el rango intercuartílico). Los máximos de soporte son de semanas
 * y, dibujados enteros, aplastaban todas las cajas contra el cero; la mecha que
 * se sale del eje se corta, y su máximo real sigue en el tooltip.
 */
function candlesCap(list: Candle[]): number {
  const cap = Math.max(1, ...list.map((v) => Math.min(v.max, v.p75 + 1.5 * (v.p75 - v.p25))));
  return Math.ceil(cap * 1.05);
}

/**
 * Una vela por valor: la mecha va del mínimo al máximo, la caja del p25 al p75
 * —la mitad central de los tickets— y la marca blanca es el promedio, la cifra
 * que se lee en todo el módulo (la mediana va en el tooltip). Leerlas
 * una contra otra dice quién es lento siempre (caja entera a la derecha) y quién
 * sólo tiene algunos casos largos (mecha larga, caja corta).
 */
export function candlesData(rows: SupportDimensionRow[], measure: SupportTimeMeasure): ChartData<'bar'> {
  const list = candles(rows, measure);
  const cap = candlesCap(list);
  const thickness = cap * 0.004;
  return {
    labels: list.map((v) => short(v.name)),
    datasets: [
      {
        label: 'Mínimo – máximo',
        data: list.map((v) => [v.min, Math.min(v.max, cap)] as [number, number]),
        backgroundColor: CHART_CHROME.textAxis,
        barPercentage: 0.12,
        grouped: false,
        order: 3,
      },
      {
        label: 'p25 – p75',
        data: list.map((v) => [v.p25, Math.max(v.p75, v.p25 + thickness)] as [number, number]),
        backgroundColor: `${CHART_PALETTE[2]}B3`,
        borderColor: CHART_PALETTE[2],
        borderWidth: 1,
        borderRadius: 3,
        barPercentage: 0.7,
        grouped: false,
        order: 2,
      },
      {
        label: 'Promedio',
        data: list.map((v) => {
          const p = Math.min(v.average, cap);
          return [p - thickness, p + thickness] as [number, number];
        }),
        backgroundColor: CHART_CHROME.textStrong,
        barPercentage: 0.85,
        grouped: false,
        order: 1,
      },
    ],
  };
}

export function candlesOptions(
  rows: SupportDimensionRow[],
  measure: SupportTimeMeasure,
  onSelect?: (name: string) => void,
): ChartOptions<'bar'> {
  const list = candles(rows, measure);
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, elements) => {
      const v = elements.length ? list[elements[0].index] : undefined;
      if (onSelect && v) onSelect(v.name);
    },
    onHover: (event, elements) => {
      const canvas = event.native?.target as HTMLCanvasElement | undefined;
      if (canvas) canvas.style.cursor = onSelect && elements.length ? 'pointer' : 'default';
    },
    interaction: { mode: 'index', axis: 'y', intersect: false },
    plugins: {
      legend: LEGEND,
      datalabels: { display: false },
      tooltip: {
        ...TOOLTIP,
        callbacks: {
          title: (items) => list[items[0]?.dataIndex ?? 0]?.name ?? '',
          label: () => '',
          afterBody: (items) => {
            const v = list[items[0]?.dataIndex ?? 0];
            if (!v) return [];
            return [
              `Promedio ${formatDuration(v.average)} · mediana ${formatDuration(v.median)}`,
              `La mitad central: ${formatDuration(v.p25)} – ${formatDuration(v.p75)}`,
              `Del más rápido al más lento: ${formatDuration(v.min)} – ${formatDuration(v.max)}`,
              `${formatInteger(v.sample)} tickets medidos`,
            ];
          },
        },
        filter: (item) => item.datasetIndex === 2,
      },
    },
    scales: {
      x: {
        min: 0,
        max: candlesCap(list),
        grid: { color: CHART_CHROME.gridSoft },
        ticks: {
          color: CHART_CHROME.textAxis,
          font: { size: 10 },
          callback: (v: string | number) => formatDuration(Number(v)),
        },
      },
      y: CATEGORY_AXIS,
    },
  };
}

export const valuesWithCandles = (rows: SupportDimensionRow[], measure: SupportTimeMeasure) =>
  candles(rows, measure).length;

// --- Qué tipo de tickets entran ----------------------------------------------

const BREAKDOWN_COLORS = [2, 3, 6, 1, 5, 9, 7, 4, 8].map((i) => CHART_PALETTE[i]);

/** Los valores más grandes de un desglose y el resto sumado en «Otros». */
export function donutBreakdown(entries: SupportDimensionEntry[] | undefined, cap = 6) {
  const rows = (entries ?? [])
    .map((e) => ({ name: e.name, tickets: toNumber(e.metrics?.total_tickets) }))
    .filter((f) => f.tickets > 0)
    .sort((a, b) => b.tickets - a.tickets);
  const total = rows.reduce((acc, f) => acc + f.tickets, 0);
  const head = rows.slice(0, cap);
  const rest = rows.slice(cap).reduce((acc, f) => acc + f.tickets, 0);
  const parts = rest > 0 ? [...head, { name: `Otros (${rows.length - cap})`, tickets: rest }] : head;

  const colors = parts.map((_, i) =>
    i === head.length ? CHART_PALETTE[10] : BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length],
  );
  const withPct = parts.map((p, i) => ({
    ...p,
    color: colors[i],
    pct: total > 0 ? Number(((p.tickets / total) * 100).toFixed(1)) : 0,
  }));

  const data: ChartData<'doughnut'> = {
    labels: parts.map((p) => short(p.name, 28)),
    datasets: [
      {
        data: withPct.map((p) => p.pct),
        backgroundColor: colors.map((c) => `${c}CC`),
        borderColor: CHART_CHROME.surfaceDeep,
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };
  return { data, total, parts: withPct, values: rows.length };
}

// --- Incidencia por zona -----------------------------------------------------

const TECHNOLOGY_COLOR: Record<string, string> = {
  FTTH: CHART_PALETTE[9],
  RF: CHART_PALETTE[7],
};

export const technologyColor = (technology: string) =>
  TECHNOLOGY_COLOR[technology.toUpperCase()] ?? CHART_PALETTE[10];

/** Las zonas con más tickets por cada 100 clientes; sin población no hay tasa. */
export function zonesWithRate(zones: SupportZoneRow[]) {
  return zones.filter((z) => !z.withoutPopulation).slice(0, VALUES_CAP);
}

export function incidenceData(zones: SupportZoneRow[]): ChartData<'bar'> {
  const visible = zonesWithRate(zones);
  return {
    labels: visible.map((z) => short(z.zona)),
    datasets: [
      {
        label: 'Tickets por cada 100 clientes',
        data: visible.map((z) => z.incidenceRate),
        backgroundColor: visible.map((z) => `${technologyColor(z.technology)}CC`),
        borderColor: visible.map((z) => technologyColor(z.technology)),
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ],
  };
}

export function incidenceOptions(zones: SupportZoneRow[]): ChartOptions<'bar'> {
  const visible = zonesWithRate(zones);
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: {
        anchor: 'end',
        align: 'right',
        color: CHART_CHROME.textMuted,
        font: { size: 10, weight: 'bold' },
        formatter: (v: number) => `${formatTwoDecimals(v)}%`,
      },
      tooltip: {
        ...TOOLTIP,
        callbacks: {
          title: (items) => {
            const z = visible[items[0]?.dataIndex ?? 0];
            return z ? `${z.zona} · ${z.site} · ${z.technology}` : '';
          },
          label: (ctx: TooltipItem<'bar'>) => ` ${formatTwoDecimals(Number(ctx.raw))} tickets por cada 100 clientes`,
          afterBody: (items) => {
            const z = visible[items[0]?.dataIndex ?? 0];
            if (!z) return [];
            return [
              `${formatInteger(z.totalTickets)} tickets · ${formatInteger(z.totalSubscribers)} clientes activos`,
              `Resueltos ${formatTwoDecimals(z.pctResolved)}% · cierre medio ${formatOneDecimal(z.mttrAverage)} h`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grace: '12%',
        grid: { color: CHART_CHROME.gridSoft },
        ticks: { color: CHART_CHROME.textAxis, font: { size: 10 }, callback: (v: string | number) => `${v}%` },
      },
      y: CATEGORY_AXIS,
    },
  };
}
