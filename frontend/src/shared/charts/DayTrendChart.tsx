/** Línea de tendencia diaria del periodo, con el día elegido marcado. */

import { useMemo } from 'react';
import type { ChartData, ChartOptions } from 'chart.js';

import { CHART_CHROME, SURFACE } from '@/shared/constants/theme';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters/number';
import { METRIC_CHART } from '@/shared/ui/theme/metricTheme';
import type { MetricColor } from '@/shared/ui/theme/types';
import { LineChart } from './LineChart';

export interface DayTrendSeries {
  label: string;
  /** Un valor por día de `dias`, en el mismo orden. */
  values: number[];
  color: MetricColor;
  /** De qué lado está lo bueno. En bajas o churn, subir es malo. */
  trendGoodWhen?: 'up' | 'down';
}

interface Props {
  title: string;
  subtitle?: string;
  /** Los días calculados del mes: el eje X. */
  dias: number[];
  series: DayTrendSeries[];
  /** Día del corte; se marca en la línea y es el que se resume en la cabecera. */
  selectedDay: number;
  /** `true` cuando los valores son porcentajes, para rotularlos como tales. */
  esTasa?: boolean;
  className?: string;
}

const formatea = (valor: number, esTasa: boolean): string =>
  esTasa ? `${formatTwoDecimals(valor)} %` : formatInteger(valor);

/**
 * Sin etiquetas por punto: treinta y un números encima de la línea no se leen.
 * El número del día elegido está en la cabecera y el resto, en el tooltip.
 */
const opcionesBase: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      align: 'end',
      labels: { color: CHART_CHROME.textMuted, font: { size: 11 }, boxWidth: 10, usePointStyle: true },
    },
    datalabels: { display: false },
    tooltip: {
      backgroundColor: SURFACE.secondary,
      titleColor: CHART_CHROME.textStrong,
      bodyColor: CHART_CHROME.textMuted,
      borderColor: CHART_CHROME.border,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
    },
  },
  scales: {
    x: { grid: { color: CHART_CHROME.grid }, ticks: { color: CHART_CHROME.textAxis, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 } },
    y: { grid: { color: CHART_CHROME.grid }, ticks: { color: CHART_CHROME.textAxis, font: { size: 10 } }, grace: '10%' },
  },
};

/**
 * La tendencia del mes de una o dos medidas, con el día del corte resaltado y su
 * variación contra el día anterior en la cabecera. Dos series como máximo por
 * gráfica: es una comparación, no un tablero.
 */
export function DayTrendChart({
  title,
  subtitle,
  dias,
  series,
  selectedDay,
  esTasa = false,
  className = 'h-56 w-full',
}: Props) {
  const idx = dias.indexOf(selectedDay);

  const data = useMemo<ChartData<'line'>>(
    () => ({
      labels: dias.map(String),
      datasets: series.map((serie) => {
        const chart = METRIC_CHART[serie.color];
        return {
          label: serie.label,
          data: serie.values,
          borderColor: chart.line,
          backgroundColor: chart.fill,
          fill: series.length === 1,
          borderWidth: 2,
          tension: 0.35,
          // El día del corte es el único punto dibujado: marca dónde está la
          // barra sin llenar la línea de puntos que no dicen nada.
          pointRadius: dias.map((_, i) => (i === idx ? 5 : 0)),
          pointBackgroundColor: chart.line,
          pointBorderColor: CHART_CHROME.textStrong,
          pointBorderWidth: dias.map((_, i) => (i === idx ? 2 : 0)),
          pointHoverRadius: 5,
        };
      }),
    }),
    [dias, series, idx],
  );

  return (
    <div className="rounded-3xl border border-slate-700/50 bg-surface-secondary/60 p-5 shadow-xl">
      <div className="mb-3">
        <h4 className="text-[13px] font-black uppercase tracking-wider text-slate-200">{title}</h4>
        {subtitle && <p className="text-[10px] font-bold text-slate-500">{subtitle}</p>}
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        {series.map((serie) => {
          const actual = idx >= 0 ? (serie.values[idx] ?? 0) : 0;
          const anterior = idx > 0 ? (serie.values[idx - 1] ?? 0) : null;
          const delta = anterior === null ? null : actual - anterior;
          const sube = (delta ?? 0) >= 0;
          // El color dice si la noticia es buena, no hacia dónde apunta: en la
          // misma gráfica, más instalados es verde y más perdidos es rojo.
          const bueno = sube === ((serie.trendGoodWhen ?? 'up') === 'up');

          return (
            <div key={serie.label} className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                {serie.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white tabular-nums">
                  {formatea(actual, esTasa)}
                </span>
                {delta !== null && (
                  <span
                    className={`text-[11px] font-bold tabular-nums ${bueno ? 'text-emerald-400' : 'text-rose-400'}`}
                    title="Contra el día calculado anterior"
                  >
                    {sube ? '+' : ''}{formatea(delta, esTasa)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <LineChart data={data} options={opcionesBase} plugins={[]} className={className} />
    </div>
  );
}
