/** Tarjeta de una métrica en un día: lo del día, el acumulado y la variación. */

import type { FC, ReactNode } from 'react';

import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters/number';
import type { DayReading, DayReference, MetricKind } from '@/shared/lib/daySeries';
import type { MetricColor } from '../theme/types';
import { MetricCard } from './MetricCard';

interface DayMetricCardProps {
  label: string;
  /** Qué mide, para saber si el número grande es un hecho del día o un nivel. */
  kind: MetricKind;
  reading: DayReading;
  /** Día del corte, solo para rotular. */
  day: number;
  color?: MetricColor;
  icon?: ReactNode;
  /** Qué es la métrica, en cuatro palabras. */
  subValue?: string;
  /** De qué lado está lo bueno. En bajas o churn, subir es malo. */
  trendGoodWhen?: 'up' | 'down';
  /** El mismo día del mes anterior, con el nombre de ese mes. */
  reference?: (DayReference & { month: string }) | null;
}

const format = (value: number, kind: MetricKind): string =>
  kind === 'tasa' ? `${formatTwoDecimals(value)} %` : formatInteger(value);

/** Cuánto va de la referencia a hoy: puntos en una tasa, % en lo demás. */
function versus(current: number, previous: number, kind: MetricKind): string | null {
  if (kind === 'tasa') {
    const points = current - previous;
    return `${points >= 0 ? '+' : ''}${formatTwoDecimals(points)} pts`;
  }
  if (previous === 0) return null;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

/**
 * El número grande es **lo del día**: en un flujo, lo que ocurrió ese día; en un
 * nivel o una tasa, cuánto marcaba ese día. Debajo va la otra mitad de la
 * pregunta —el acumulado del mes en un flujo, el valor del día anterior en lo
 * demás, que en un nivel es lo único que el acumulado no dice ya—, y arriba la
 * variación contra ese día anterior.
 */
export const DayMetricCard: FC<DayMetricCardProps> = ({
  label,
  kind,
  reading,
  day,
  color = 'blue',
  icon,
  subValue,
  trendGoodWhen = 'up',
  reference,
}) => {
  const { accumulated, ofDay: dayData, previous: prev, variation, inPoints } = reading;

  // En un flujo se compara lo que llevaba el mes a esa altura; en lo demás, el valor del día.
  const compared = kind === 'flujo' ? accumulated : dayData;
  const delta = reference ? versus(compared, reference.value, kind) : null;
  const referenceText = reference
    ? `${reference.month}, ${kind === 'flujo' ? 'al día' : 'día'} ${reference.day}: ${format(reference.value, kind)}`
    : null;

  const pie =
    kind === 'flujo'
      ? `Acumulado del mes: ${format(accumulated, kind)}`
      : prev === null
        ? 'Primer día calculado'
        : `Día anterior: ${format(prev, kind)}`;

  return (
    <MetricCard
      label={label}
      value={format(dayData, kind)}
      caption={kind === 'flujo' ? `En el día ${day}` : `Al día ${day}`}
      subValue={subValue}
      color={color}
      icon={icon}
      trend={variation ?? undefined}
      trendSuffix={inPoints ? ' %' : '%'}
      trendGoodWhen={trendGoodWhen}
    >
      <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-400" title={pie}>
        {pie}
      </p>
      {referenceText && (
        <p
          className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-500"
          title={`Mes anterior · ${referenceText}${delta ? ` (hoy ${delta})` : ''}`}
        >
          {referenceText}
          {delta && <span className="ml-1 text-slate-400">· {delta}</span>}
        </p>
      )}
    </MetricCard>
  );
};
