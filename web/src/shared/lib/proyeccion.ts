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

export interface Proyeccion {
  /** Días laborables del 1 al día del corte, ambos incluidos. */
  diasTranscurridos: number;
  /** Días laborables del mes entero. */
  diasMes: number;
  /** Día del mes del corte. */
  dia: number;
}

const DOMINGO = 0;

/** Días laborables (lunes a sábado) del 1 al `hasta` del mes. */
function contarLaborables(anio: number, mes: number, hasta: number): number {
  let total = 0;
  for (let dia = 1; dia <= hasta; dia += 1) {
    if (new Date(anio, mes - 1, dia).getDay() !== DOMINGO) total += 1;
  }
  return total;
}

/**
 * Los días laborables del corte y del mes, o `null` si no hay corte que
 * proyectar: sin día elegido, con un periodo que no es `YYYY-MM`, o con un corte
 * que todavía no cubre ningún día laborable (un día 1 que cae en domingo).
 */
export function calcularProyeccion(periodoMes: string | undefined, dia: number): Proyeccion | null {
  const match = (periodoMes ?? '').match(/^(\d{4})-(\d{2})/);
  if (!match || !dia) return null;

  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const diasTranscurridos = contarLaborables(anio, mes, Math.min(dia, ultimoDia));
  if (!diasTranscurridos) return null;

  return { diasTranscurridos, diasMes: contarLaborables(anio, mes, ultimoDia), dia };
}

/** El promedio por día laborable de lo acumulado al corte. */
export function promedioDiario(acumulado: number, proyeccion: Proyeccion): number {
  return acumulado / proyeccion.diasTranscurridos;
}

/** Lo acumulado al corte llevado al cierre del mes al mismo ritmo, redondeado. */
export function proyectar(acumulado: number, proyeccion: Proyeccion): number {
  return Math.round(promedioDiario(acumulado, proyeccion) * proyeccion.diasMes);
}
