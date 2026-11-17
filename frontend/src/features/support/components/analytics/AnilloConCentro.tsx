/**
 * Un anillo cuyo centro dice lo que señala el ratón.
 *
 * En reposo el centro enseña el total (`centro`); al pasar por una franja,
 * `alPasar(i)` decide qué poner —su nombre y su cifra—, como los anillos de
 * Subscriptions y CRM. La leyenda no va dentro del lienzo: le quitaba la mitad
 * del espacio al dibujo y el anillo quedaba diminuto. Quien lo usa pone al lado
 * o debajo su propia lista, con más datos que una leyenda.
 */

import { useMemo, useState } from 'react';
import type { ActiveElement, ChartData, ChartEvent } from 'chart.js';

import { DoughnutChart, getDoughnutOptions } from '@/shared/charts';

export interface TextoCentro {
  title: string;
  value: string;
}

interface Props {
  data: ChartData<'doughnut'>;
  centro: TextoCentro;
  alPasar: (indice: number) => TextoCentro;
  /** Las franjas por debajo de este valor no llevan etiqueta (se solaparían). */
  minLabelValue?: number;
  className?: string;
}

/** El hueco del anillo es estrecho: un nombre largo se corta antes de encogerse ilegible. */
const recortar = (texto: string, max = 22) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

export function AnilloConCentro({ data, centro, alPasar, minLabelValue = 6, className }: Props) {
  const [activo, setActivo] = useState<number | null>(null);

  const options = useMemo(() => {
    const texto = activo === null ? centro : alPasar(activo);
    const base = getDoughnutOptions(
      { title: recortar(texto.title), value: texto.value },
      (_evento: ChartEvent, elementos: ActiveElement[]) => {
        const i = elementos.length ? elementos[0].index : null;
        setActivo((prev) => (prev === i ? prev : i));
      },
      { valueSuffix: '%', minLabelValue },
    );
    return { ...base, plugins: { ...base.plugins, legend: { display: false } } };
  }, [activo, centro, alPasar, minLabelValue]);

  return <DoughnutChart data={data} options={options} className={className} />;
}
