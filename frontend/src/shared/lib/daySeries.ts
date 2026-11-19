/**
 * Lecturas sobre la serie diaria de un mes.
 *
 * Lo que el backend guarda de cada día es el corte **acumulado** del mes hasta
 * ese día, no lo que pasó ese día: es la única forma de que un corte sea
 * autoconsistente (un porcentaje del día 7 necesita su propio denominador). Lo
 * del día suelto se obtiene restando el día calculado anterior, y eso es lo que
 * hace este módulo.
 *
 * Restar solo tiene sentido en las métricas que **crecen** con el corte. Por eso
 * cada una declara su naturaleza:
 *
 * - `flujo` — cuenta hechos que se van sumando y que ya no se deshacen: un alta,
 *   un cierre, un corte por impago. Lo del día es la diferencia; el acumulado,
 *   el valor guardado.
 * - `stock` — es un nivel a esa fecha (activos, pipeline, bajas). No se resta: el
 *   valor del día ES el nivel, y la diferencia solo sirve como variación.
 * - `tasa` — un porcentaje ya calculado sobre el acumulado. Ni se resta ni se
 *   suma: se compara, y su variación son puntos porcentuales, no un porcentaje
 *   de un porcentaje.
 *
 * **El error fácil es llamar `flujo` a algo que puede retroceder.** Las bajas de
 * suscripciones son el caso de manual: el analizador las define como «de la base
 * activa al inicio, quién no está activo al corte», así que una orden que vuelve
 * al servicio sale del conjunto y la cifra baja. Restar dos días daría «−2.900
 * bajas», que no es un número que signifique nada. Antes de poner `flujo`, hay
 * que saber que la métrica no puede bajar al avanzar el corte.
 *
 * «El día anterior» es el día **calculado** anterior, no `dia - 1`: un mes puede
 * tener huecos (un día sin nada que cortar no deja columna) y saltárselos es lo
 * que evita que un hueco se lea como una caída a cero.
 */

import type { DaySeries } from '@/shared/types/domain';

export type MetricKind = 'flujo' | 'stock' | 'tasa';

export interface DayReading {
  /** El acumulado del mes hasta el día elegido. */
  accumulated: number;
  /** Lo ocurrido ese día (`flujo`) o el nivel de ese día (`stock`, `tasa`). */
  ofDay: number;
  /** El mismo `ofDay` del día calculado anterior; `null` si no hay. */
  previous: number | null;
  /** Cambio frente al día anterior, o `null` si no es medible. */
  variation: number | null;
  /** `true` cuando `variacion` son puntos porcentuales y no un porcentaje. */
  inPoints: boolean;
}

const EMPTY: DayReading = {
  accumulated: 0,
  ofDay: 0,
  previous: null,
  variation: null,
  inPoints: false,
};

/** Los días con corte, ordenados. Es el eje de todo lo demás. */
export function computedDays(series: DaySeries | undefined): number[] {
  return Object.keys(series ?? {})
    .map(Number)
    .filter((day) => Number.isFinite(day))
    .sort((a, b) => a - b);
}

const valueAt = (series: DaySeries, day: number, key: string): number => {
  const gross = series[String(day)]?.[key];
  return typeof gross === 'number' && Number.isFinite(gross) ? gross : 0;
};

/** El día calculado inmediatamente anterior a `dia`, o `null` si es el primero. */
const previousDay = (days: number[], day: number): number | null => {
  const idx = days.indexOf(day);
  return idx > 0 ? days[idx - 1] : null;
};

/** El valor propio de un día: la diferencia en un flujo, el nivel en lo demás. */
function ownOf(
  series: DaySeries,
  days: number[],
  day: number,
  key: string,
  kind: MetricKind,
): number {
  const accumulated = valueAt(series, day, key);
  if (kind !== 'flujo') return accumulated;

  const prev = previousDay(days, day);
  // El primer día calculado no tiene nada que restar: su acumulado ya es lo suyo.
  return prev === null ? accumulated : accumulated - valueAt(series, prev, key);
}

/** Todo lo que una tarjeta necesita de una métrica en un día. */
export function readDay(
  series: DaySeries | undefined,
  days: number[],
  day: number,
  key: string,
  kind: MetricKind,
): DayReading {
  if (!series || !day || !days.includes(day)) return EMPTY;

  const accumulated = valueAt(series, day, key);
  const dayData = ownOf(series, days, day, key, kind);

  const previous = previousDay(days, day);
  const prev = previous === null ? null : ownOf(series, days, previous, key, kind);

  // Una tasa se compara en puntos: el 40 % que pasa a 42 % subió dos puntos, no
  // un 5 %, y decir lo segundo invita a leerlo como cinco puntos.
  const inPoints = kind === 'tasa';
  let variation: number | null = null;
  if (prev !== null) {
    if (inPoints) variation = Number((dayData - prev).toFixed(2));
    // Sin base no hay porcentaje de cambio: de 0 a 5 no es un «+∞ %».
    else if (prev !== 0) variation = Number((((dayData - prev) / Math.abs(prev)) * 100).toFixed(1));
  }

  return { accumulated, ofDay: dayData, previous: prev, variation, inPoints };
}

/** La serie de una métrica a lo largo del mes, lista para una gráfica de línea. */
export function seriesOf(
  series: DaySeries | undefined,
  days: number[],
  key: string,
  kind: MetricKind,
): number[] {
  if (!series) return [];
  return days.map((day) => ownOf(series, days, day, key, kind));
}

export interface DayReference {
  /** El día del otro mes que se leyó: el mismo o, si ese mes no llega, su último corte anterior. */
  day: number;
  /** El acumulado al corte en un `flujo`; el nivel de ese día en lo demás. */
  value: number;
}

/**
 * Cómo estaba la métrica el mismo día de otro mes (el anterior, como referencia).
 *
 * En un `flujo` se lee el acumulado al corte —lo que llevaba el mes a esa
 * altura—, que es lo comparable con el acumulado de hoy; en un nivel o una tasa,
 * el valor de ese día. Si ese mes no tiene el día (febrero frente a un 31, o un
 * hueco), vale su último corte anterior; sin ninguno, `null`.
 */
export function readReference(series: DaySeries | undefined, day: number, key: string): DayReference | null {
  if (!series || !day) return null;
  const earlier = computedDays(series).filter((d) => d <= day);
  if (!earlier.length) return null;
  const refDay = earlier[earlier.length - 1];
  return { day: refDay, value: valueAt(series, refDay, key) };
}
