/**
 * Un anillo cuyo centro dice lo que señala el ratón.
 *
 * En reposo el centro enseña el total (`centro`); al pasar por una franja,
 * `onHover(i)` decide qué poner —su nombre y su cifra—, como los anillos de
 * Subscriptions y CRM. La leyenda no va dentro del lienzo: le quitaba la mitad
 * del espacio al dibujo y el anillo quedaba diminuto. Quien lo usa pone al lado
 * o debajo su propia lista, con más datos que una leyenda.
 */

import { useMemo, useState } from 'react';
import type { ActiveElement, ChartData, ChartEvent } from 'chart.js';

import { DoughnutChart, getDoughnutOptions } from '@/shared/charts';

export interface CenterText {
  title: string;
  value: string;
}

interface Props {
  data: ChartData<'doughnut'>;
  center: CenterText;
  onHover: (index: number) => CenterText;
  /** Las franjas por debajo de este valor no llevan etiqueta (se solaparían). */
  minLabelValue?: number;
  className?: string;
}

/** El hueco del anillo es estrecho: un nombre largo se corta antes de encogerse ilegible. */
const truncate = (text: string, max = 22) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function CenteredRing({ data, center, onHover, minLabelValue = 6, className }: Props) {
  const [active, setActive] = useState<number | null>(null);

  const options = useMemo(() => {
    const text = active === null ? center : onHover(active);
    const base = getDoughnutOptions(
      { title: truncate(text.title), value: text.value },
      (_event: ChartEvent, elements: ActiveElement[]) => {
        const i = elements.length ? elements[0].index : null;
        setActive((prev) => (prev === i ? prev : i));
      },
      { valueSuffix: '%', minLabelValue },
    );
    return { ...base, plugins: { ...base.plugins, legend: { display: false } } };
  }, [active, center, onHover, minLabelValue]);

  return <DoughnutChart data={data} options={options} className={className} />;
}
