/** Tarjeta de una métrica en un día: lo del día, el acumulado y la variación. */

import type { FC, ReactNode } from 'react';

import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters/number';
import type { DayReading, MetricKind } from '@/shared/lib/daySeries';
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
}

const format = (value: number, kind: MetricKind): string =>
  kind === 'tasa' ? `${formatTwoDecimals(value)} %` : formatInteger(value);

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
}) => {
  const { accumulated, ofDay: dayData, previous: prev, variation, inPoints } = reading;

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
    </MetricCard>
  );
};
