/**
 * Los gráficos de Support Analytics, armados desde los bloques de métricas.
 *
 * Analytics es para ver el mes de un vistazo y qué lo empuja; las tablas
 * completas viven en Results. Por eso cada eje se dibuja con sus valores más
 * grandes (`TOPE_VALORES`) y el resto se nombra, no se esconde.
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
import { COLOR_TIPO, ETIQUETA_TIPO, formatDuracion } from './flujoFormat';

/** Cuántos valores de un eje entran en un gráfico antes de pasar a «y N más». */
export const TOPE_VALORES = 15;

const TOOLTIP = {
  backgroundColor: CHART_CHROME.surfaceDeep,
  titleColor: CHART_CHROME.textStrong,
  bodyColor: CHART_CHROME.textMuted,
  borderColor: CHART_CHROME.border,
  borderWidth: 1,
  padding: 12,
  cornerRadius: 8,
};

const LEYENDA = {
  display: true,
  position: 'bottom' as const,
  labels: { color: CHART_CHROME.textAxis, boxWidth: 10, font: { size: 10 }, padding: 14 },
};

const EJE_CATEGORIAS = {
  grid: { display: false },
  ticks: { color: CHART_CHROME.textMuted, font: { size: 11 }, autoSkip: false },
};

/** Alto de un gráfico de barras horizontales con `n` filas. */
export const altoBarras = (n: number) => Math.max(180, n * 30 + 70);

/** Recorta un nombre largo de Odoo para el eje, entero en el tooltip. */
const corto = (texto: string, max = 34) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

// --- En qué se va el tiempo -------------------------------------------------

export const TIPOS_TIEMPO = ['cola', 'pausa', 'gestion', 'sin_clasificar'] as const;
export type TipoTiempo = (typeof TIPOS_TIEMPO)[number];

export interface ParteTiempo {
  tipo: TipoTiempo;
  label: string;
  horas: number;
  pct: number;
  color: string;
}

/** Qué se hace en cada tipo de etapa, para el pie de su tarjeta. */
export const QUE_ES_TIPO: Record<TipoTiempo, string> = {
  cola: 'Esperando a que alguien lo tome',
  pausa: 'Esperando algo de fuera: cliente, pago, falla masiva',
  gestion: 'Alguien trabajando en él',
  sin_clasificar: 'Etapas que el catálogo aún no clasifica',
};

/** Las cuatro partes del tiempo medio del grupo, de lo cerrado con logs. */
export function partesDelTiempo(stats: SupportStats): { partes: ParteTiempo[]; total: number } {
  const horas = (tipo: TipoTiempo) => toNumber(stats[`composicion_${tipo}_horas`]);
  const total = TIPOS_TIEMPO.reduce((acc, tipo) => acc + horas(tipo), 0);
  const partes = TIPOS_TIEMPO.map((tipo) => ({
    tipo,
    label: ETIQUETA_TIPO[tipo],
    horas: horas(tipo),
    pct: total > 0 ? Number(((horas(tipo) / total) * 100).toFixed(1)) : 0,
    color: COLOR_TIPO[tipo],
  })).filter((p) => p.horas > 0 || p.tipo !== 'sin_clasificar');
  return { partes, total };
}

export function tiempoDonutData(partes: ParteTiempo[]): ChartData<'doughnut'> {
  return {
    labels: partes.map((p) => p.label),
    datasets: [
      {
        data: partes.map((p) => p.pct),
        backgroundColor: partes.map((p) => `${p.color}D9`),
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
export function volumenPorValorData(rows: SupportDimensionRow[]): ChartData<'bar'> {
  const visibles = rows.slice(0, TOPE_VALORES);
  const serie = (label: string, color: string, valor: (r: SupportDimensionRow) => number) => ({
    label,
    data: visibles.map(valor),
    backgroundColor: `${color}CC`,
    borderColor: color,
    borderWidth: 1,
    borderRadius: 3,
    stack: 'tickets',
    maxBarThickness: 22,
  });
  const hayEscalados = visibles.some((r) => toNumber(r.tickets_escalados) > 0);

  return {
    labels: visibles.map((r) => corto(r.nombre)),
    datasets: [
      serie('Resueltos', METRIC_COLOR.green, (r) => toNumber(r.tickets_resueltos)),
      serie('Cancelados', METRIC_COLOR.red, (r) => toNumber(r.tickets_cancelados)),
      ...(hayEscalados
        ? [serie('Escalados a Soporte', METRIC_COLOR.yellow, (r) => toNumber(r.tickets_escalados))]
        : []),
      serie('Sin cerrar', METRIC_COLOR.slate, (r) =>
        Math.max(0, toNumber(r.total_tickets) - toNumber(r.tickets_cerrados)),
      ),
    ],
  };
}

export function volumenPorValorOptions(
  rows: SupportDimensionRow[],
  onSelect?: (indice: number) => void,
): ChartOptions<'bar'> {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_evento, elementos) => {
      if (onSelect && elementos.length) onSelect(elementos[0].index);
    },
    onHover: (evento, elementos) => {
      const canvas = evento.native?.target as HTMLCanvasElement | undefined;
      if (canvas) canvas.style.cursor = onSelect && elementos.length ? 'pointer' : 'default';
    },
    interaction: { mode: 'index', axis: 'y', intersect: false },
    plugins: {
      legend: LEYENDA,
      datalabels: { display: false },
      tooltip: {
        ...TOOLTIP,
        callbacks: {
          title: (items) => rows[items[0]?.dataIndex ?? 0]?.nombre ?? '',
          label: (ctx: TooltipItem<'bar'>) => ` ${ctx.dataset.label}: ${formatInteger(Number(ctx.raw))}`,
          footer: (items) => {
            const r = rows[items[0]?.dataIndex ?? 0];
            if (!r) return '';
            return [
              `${formatInteger(toNumber(r.total_tickets))} tickets · ${formatTwoDecimals(r.pctDelPadre)}% del grupo`,
              `Resueltos ${formatTwoDecimals(toNumber(r.pct_resueltos))}% de lo cerrado`,
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
      y: { stacked: true, ...EJE_CATEGORIAS },
    },
  };
}

// --- Velas: cómo se reparte el tiempo de cada valor -------------------------

interface Vela {
  nombre: string;
  min: number;
  p25: number;
  mediana: number;
  promedio: number;
  p75: number;
  max: number;
  muestra: number;
}

function velas(rows: SupportDimensionRow[], medida: SupportTimeMeasure): Vela[] {
  return rows
    .slice(0, TOPE_VALORES)
    .map((r) => ({
      nombre: r.nombre,
      min: toNumber(r[`tiempo_min_${medida}_horas`]),
      p25: toNumber(r[`tiempo_p25_${medida}_horas`]),
      mediana: toNumber(r[`tiempo_mediana_${medida}_horas`]),
      promedio: toNumber(r[`tiempo_medio_${medida}_horas`]),
      p75: toNumber(r[`tiempo_p75_${medida}_horas`]),
      max: toNumber(r[`tiempo_max_${medida}_horas`]),
      muestra: toNumber(r[`muestra_${medida}`]),
    }))
    .filter((v) => v.muestra > 0);
}

/**
 * El tope del eje: hasta donde llega la mayor de las mechas «razonables»
 * (p75 + 1,5 × el rango intercuartílico). Los máximos de soporte son de semanas
 * y, dibujados enteros, aplastaban todas las cajas contra el cero; la mecha que
 * se sale del eje se corta, y su máximo real sigue en el tooltip.
 */
function topeVelas(lista: Vela[]): number {
  const tope = Math.max(1, ...lista.map((v) => Math.min(v.max, v.p75 + 1.5 * (v.p75 - v.p25))));
  return Math.ceil(tope * 1.05);
}

/**
 * Una vela por valor: la mecha va del mínimo al máximo, la caja del p25 al p75
 * —la mitad central de los tickets— y la marca blanca es el promedio, la cifra
 * que se lee en todo el módulo (la mediana va en el tooltip). Leerlas
 * una contra otra dice quién es lento siempre (caja entera a la derecha) y quién
 * sólo tiene algunos casos largos (mecha larga, caja corta).
 */
export function velasData(rows: SupportDimensionRow[], medida: SupportTimeMeasure): ChartData<'bar'> {
  const lista = velas(rows, medida);
  const tope = topeVelas(lista);
  const grosor = tope * 0.004;
  return {
    labels: lista.map((v) => corto(v.nombre)),
    datasets: [
      {
        label: 'Mínimo – máximo',
        data: lista.map((v) => [v.min, Math.min(v.max, tope)] as [number, number]),
        backgroundColor: CHART_CHROME.textAxis,
        barPercentage: 0.12,
        grouped: false,
        order: 3,
      },
      {
        label: 'p25 – p75',
        data: lista.map((v) => [v.p25, Math.max(v.p75, v.p25 + grosor)] as [number, number]),
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
        data: lista.map((v) => {
          const p = Math.min(v.promedio, tope);
          return [p - grosor, p + grosor] as [number, number];
        }),
        backgroundColor: CHART_CHROME.textStrong,
        barPercentage: 0.85,
        grouped: false,
        order: 1,
      },
    ],
  };
}

export function velasOptions(
  rows: SupportDimensionRow[],
  medida: SupportTimeMeasure,
  onSelect?: (nombre: string) => void,
): ChartOptions<'bar'> {
  const lista = velas(rows, medida);
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_evento, elementos) => {
      const v = elementos.length ? lista[elementos[0].index] : undefined;
      if (onSelect && v) onSelect(v.nombre);
    },
    onHover: (evento, elementos) => {
      const canvas = evento.native?.target as HTMLCanvasElement | undefined;
      if (canvas) canvas.style.cursor = onSelect && elementos.length ? 'pointer' : 'default';
    },
    interaction: { mode: 'index', axis: 'y', intersect: false },
    plugins: {
      legend: LEYENDA,
      datalabels: { display: false },
      tooltip: {
        ...TOOLTIP,
        callbacks: {
          title: (items) => lista[items[0]?.dataIndex ?? 0]?.nombre ?? '',
          label: () => '',
          afterBody: (items) => {
            const v = lista[items[0]?.dataIndex ?? 0];
            if (!v) return [];
            return [
              `Promedio ${formatDuracion(v.promedio)} · mediana ${formatDuracion(v.mediana)}`,
              `La mitad central: ${formatDuracion(v.p25)} – ${formatDuracion(v.p75)}`,
              `Del más rápido al más lento: ${formatDuracion(v.min)} – ${formatDuracion(v.max)}`,
              `${formatInteger(v.muestra)} tickets medidos`,
            ];
          },
        },
        filter: (item) => item.datasetIndex === 2,
      },
    },
    scales: {
      x: {
        min: 0,
        max: topeVelas(lista),
        grid: { color: CHART_CHROME.gridSoft },
        ticks: {
          color: CHART_CHROME.textAxis,
          font: { size: 10 },
          callback: (v: string | number) => formatDuracion(Number(v)),
        },
      },
      y: EJE_CATEGORIAS,
    },
  };
}

export const valoresConVelas = (rows: SupportDimensionRow[], medida: SupportTimeMeasure) =>
  velas(rows, medida).length;

// --- Qué tipo de tickets entran ----------------------------------------------

const COLORES_DESGLOSE = [2, 3, 6, 1, 5, 9, 7, 4, 8].map((i) => CHART_PALETTE[i]);

/** Los valores más grandes de un desglose y el resto sumado en «Otros». */
export function desgloseDonut(entradas: SupportDimensionEntry[] | undefined, tope = 6) {
  const filas = (entradas ?? [])
    .map((e) => ({ nombre: e.nombre, tickets: toNumber(e.metricas?.total_tickets) }))
    .filter((f) => f.tickets > 0)
    .sort((a, b) => b.tickets - a.tickets);
  const total = filas.reduce((acc, f) => acc + f.tickets, 0);
  const cabeza = filas.slice(0, tope);
  const resto = filas.slice(tope).reduce((acc, f) => acc + f.tickets, 0);
  const partes = resto > 0 ? [...cabeza, { nombre: `Otros (${filas.length - tope})`, tickets: resto }] : cabeza;

  const colores = partes.map((_, i) =>
    i === cabeza.length ? CHART_PALETTE[10] : COLORES_DESGLOSE[i % COLORES_DESGLOSE.length],
  );
  const conPct = partes.map((p, i) => ({
    ...p,
    color: colores[i],
    pct: total > 0 ? Number(((p.tickets / total) * 100).toFixed(1)) : 0,
  }));

  const data: ChartData<'doughnut'> = {
    labels: partes.map((p) => corto(p.nombre, 28)),
    datasets: [
      {
        data: conPct.map((p) => p.pct),
        backgroundColor: colores.map((c) => `${c}CC`),
        borderColor: CHART_CHROME.surfaceDeep,
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };
  return { data, total, partes: conPct, valores: filas.length };
}

// --- Incidencia por zona -----------------------------------------------------

const COLOR_TECNOLOGIA: Record<string, string> = {
  FTTH: CHART_PALETTE[9],
  RF: CHART_PALETTE[7],
};

export const colorTecnologia = (tecnologia: string) =>
  COLOR_TECNOLOGIA[tecnologia.toUpperCase()] ?? CHART_PALETTE[10];

/** Las zonas con más tickets por cada 100 clientes; sin población no hay tasa. */
export function zonasConTasa(zonas: SupportZoneRow[]) {
  return zonas.filter((z) => !z.sinPoblacion).slice(0, TOPE_VALORES);
}

export function incidenciaData(zonas: SupportZoneRow[]): ChartData<'bar'> {
  const visibles = zonasConTasa(zonas);
  return {
    labels: visibles.map((z) => corto(z.zona)),
    datasets: [
      {
        label: 'Tickets por cada 100 clientes',
        data: visibles.map((z) => z.tasaIncidencia),
        backgroundColor: visibles.map((z) => `${colorTecnologia(z.tecnologia)}CC`),
        borderColor: visibles.map((z) => colorTecnologia(z.tecnologia)),
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ],
  };
}

export function incidenciaOptions(zonas: SupportZoneRow[]): ChartOptions<'bar'> {
  const visibles = zonasConTasa(zonas);
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
            const z = visibles[items[0]?.dataIndex ?? 0];
            return z ? `${z.zona} · ${z.site} · ${z.tecnologia}` : '';
          },
          label: (ctx: TooltipItem<'bar'>) => ` ${formatTwoDecimals(Number(ctx.raw))} tickets por cada 100 clientes`,
          afterBody: (items) => {
            const z = visibles[items[0]?.dataIndex ?? 0];
            if (!z) return [];
            return [
              `${formatInteger(z.totalTickets)} tickets · ${formatInteger(z.totalSuscriptores)} clientes activos`,
              `Resueltos ${formatTwoDecimals(z.pctResueltos)}% · cierre medio ${formatOneDecimal(z.mttrPromedio)} h`,
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
      y: EJE_CATEGORIAS,
    },
  };
}
