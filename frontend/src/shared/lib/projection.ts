/**
 * Proyección al cierre del mes a partir del ritmo de los días laborables.
 *
 * Un día laborable es cualquiera menos el domingo. Lo acumulado hasta el corte
 * se divide entre los días laborables transcurridos —el promedio diario— y se
 * multiplica por los del mes entero: es lo que se cerraría si el resto del mes
 * siguiera al mismo ritmo.
 *
 * Solo tiene sentido sobre un `flujo` (algo que se acumula y no se deshace,
 * como las instalaciones). Proyectar un nivel o una tasa así no significa nada:
 * las bajas de suscripciones, por ejemplo, pueden bajar al avanzar el corte
 * (ver `daySeries.ts`).
 */

export interface Projection {
  /** Días laborables del 1 al día del corte, ambos incluidos. */
  elapsedDays: number;
  /** Días laborables del mes entero. */
  monthDays: number;
  /** Día del mes del corte. */
  day: number;
}

const SUNDAY = 0;

/** Días laborables (lunes a sábado) del 1 al `hasta` del mes. */
function countWorkdays(year: number, month: number, until: number): number {
  let total = 0;
  for (let day = 1; day <= until; day += 1) {
    if (new Date(year, month - 1, day).getDay() !== SUNDAY) total += 1;
  }
  return total;
}

/**
 * Los días laborables del corte y del mes, o `null` si no hay corte que
 * proyectar: sin día elegido, con un periodo que no es `YYYY-MM`, o con un corte
 * que todavía no cubre ningún día laborable (un día 1 que cae en domingo).
 */
export function computeProjection(monthPeriod: string | undefined, day: number): Projection | null {
  const match = (monthPeriod ?? '').match(/^(\d{4})-(\d{2})/);
  if (!match || !day) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const elapsedDays = countWorkdays(year, month, Math.min(day, lastDay));
  if (!elapsedDays) return null;

  return { elapsedDays, monthDays: countWorkdays(year, month, lastDay), day };
}

/** El promedio por día laborable de lo acumulado al corte. */
export function dailyAverage(accumulated: number, projection: Projection): number {
  return accumulated / projection.elapsedDays;
}

/** Lo acumulado al corte llevado al cierre del mes al mismo ritmo, redondeado. */
export function project(accumulated: number, projection: Projection): number {
  return Math.round(dailyAverage(accumulated, projection) * projection.monthDays);
}
