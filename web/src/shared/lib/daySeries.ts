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
  acumulado: number;
  /** Lo ocurrido ese día (`flujo`) o el nivel de ese día (`stock`, `tasa`). */
  delDia: number;
  /** El mismo `delDia` del día calculado anterior; `null` si no hay. */
  previo: number | null;
  /** Cambio frente al día anterior, o `null` si no es medible. */
  variacion: number | null;
  /** `true` cuando `variacion` son puntos porcentuales y no un porcentaje. */
  enPuntos: boolean;
}

const VACIO: DayReading = {
  acumulado: 0,
  delDia: 0,
  previo: null,
  variacion: null,
  enPuntos: false,
};

/** Los días con corte, ordenados. Es el eje de todo lo demás. */
export function diasCalculados(serie: DaySeries | undefined): number[] {
  return Object.keys(serie ?? {})
    .map(Number)
    .filter((dia) => Number.isFinite(dia))
    .sort((a, b) => a - b);
}

const valorEn = (serie: DaySeries, dia: number, key: string): number => {
  const bruto = serie[String(dia)]?.[key];
  return typeof bruto === 'number' && Number.isFinite(bruto) ? bruto : 0;
};

/** El día calculado inmediatamente anterior a `dia`, o `null` si es el primero. */
const diaAnterior = (dias: number[], dia: number): number | null => {
  const idx = dias.indexOf(dia);
  return idx > 0 ? dias[idx - 1] : null;
};

/** El valor propio de un día: la diferencia en un flujo, el nivel en lo demás. */
function propioDe(
  serie: DaySeries,
  dias: number[],
  dia: number,
  key: string,
  kind: MetricKind,
): number {
  const acumulado = valorEn(serie, dia, key);
  if (kind !== 'flujo') return acumulado;

  const previo = diaAnterior(dias, dia);
  // El primer día calculado no tiene nada que restar: su acumulado ya es lo suyo.
  return previo === null ? acumulado : acumulado - valorEn(serie, previo, key);
}

/** Todo lo que una tarjeta necesita de una métrica en un día. */
export function leerDia(
  serie: DaySeries | undefined,
  dias: number[],
  dia: number,
  key: string,
  kind: MetricKind,
): DayReading {
  if (!serie || !dia || !dias.includes(dia)) return VACIO;

  const acumulado = valorEn(serie, dia, key);
  const delDia = propioDe(serie, dias, dia, key, kind);

  const anterior = diaAnterior(dias, dia);
  const previo = anterior === null ? null : propioDe(serie, dias, anterior, key, kind);

  // Una tasa se compara en puntos: el 40 % que pasa a 42 % subió dos puntos, no
  // un 5 %, y decir lo segundo invita a leerlo como cinco puntos.
  const enPuntos = kind === 'tasa';
  let variacion: number | null = null;
  if (previo !== null) {
    if (enPuntos) variacion = Number((delDia - previo).toFixed(2));
    // Sin base no hay porcentaje de cambio: de 0 a 5 no es un «+∞ %».
    else if (previo !== 0) variacion = Number((((delDia - previo) / Math.abs(previo)) * 100).toFixed(1));
  }

  return { acumulado, delDia, previo, variacion, enPuntos };
}

/** La serie de una métrica a lo largo del mes, lista para una gráfica de línea. */
export function serieDe(
  serie: DaySeries | undefined,
  dias: number[],
  key: string,
  kind: MetricKind,
): number[] {
  if (!serie) return [];
  return dias.map((dia) => propioDe(serie, dias, dia, key, kind));
}
