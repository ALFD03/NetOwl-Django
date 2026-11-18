/**
 * El filtro por métrica de los reportes comerciales: «crecimiento >= 3»,
 * «churn > 2,5», «proyección < 100».
 *
 * Se aplica en dos niveles, a elegir: a cada zona (las filas de la tabla) o al
 * grupo que las reúne —el site en Ventas, el coordinador en Unidades de
 * Negocio—, medido sobre sus totales. Los valores son los mismos que la
 * pantalla enseña, y se comparan redondeados a dos decimales como se ven: si
 * una fila dice 3,00 %, «= 3» la encuentra y «> 3» no.
 */

import type { Proyeccion } from '@/shared/lib/projection';

import { calcCommercial } from './commercial';
import type { Meta } from './targets';

export type FilterMetric = 'growth' | 'churn' | 'proyeccion';
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=';
/** `zona`: cada fila de la tabla. `grupo`: el site o el coordinador, por sus totales. */
export type FilterLevel = 'zona' | 'grupo';

export interface MetricFilter {
  metrica: FilterMetric;
  operador: FilterOperator;
  /** Tal como se escribió: vacío es «sin filtro». */
  value: string;
  level: FilterLevel;
}

export const EMPTY_METRIC_FILTER: MetricFilter = {
  metrica: 'growth',
  operador: '>=',
  value: '',
  level: 'zona',
};

export const FILTER_METRICS: { value: FilterMetric; label: string }[] = [
  { value: 'growth', label: 'Crecimiento %' },
  { value: 'churn', label: 'Churn %' },
  { value: 'proyeccion', label: 'Proyección %' },
];

export const FILTER_OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<='];

/** Lo que el campo admite mientras se escribe: un número con signo y decimales con punto o coma. */
export const FILTER_VALUE_PATTERN = /^-?\d*([.,]\d*)?$/;

/** Las tres métricas de una zona o de un grupo. `projection` es `null` sin un día de corte. */
export interface MetricValues {
  growth: number;
  churn: number;
  /** El cumplimiento de ventas proyectado al cierre, en % del objetivo. */
  proyeccion: number | null;
}

/**
 * El umbral del filtro, o `null` si no filtra: sin valor, con un valor que no
 * es todavía un número («-», «3,») o filtrando por proyección sin un día que
 * proyectar.
 */
export function filterThreshold(filtro: MetricFilter, proyeccion: Proyeccion | null): number | null {
  if (filtro.metrica === 'proyeccion' && !proyeccion) return null;
  const texto = filtro.value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(texto)) return null;
  return Number(texto);
}

const dosDecimales = (valor: number) => Math.round(valor * 100) / 100;

/** Si los valores cumplen el filtro. Con `umbral` nulo no se filtra nada. */
export function matchesFilter(valores: MetricValues, filtro: MetricFilter, umbral: number | null): boolean {
  if (umbral === null) return true;
  const crudo = valores[filtro.metrica];
  if (crudo === null) return false;

  const valor = dosDecimales(crudo);
  const objetivo = dosDecimales(umbral);
  switch (filtro.operador) {
    case '=': return valor === objetivo;
    case '!=': return valor !== objetivo;
    case '>': return valor > objetivo;
    case '<': return valor < objetivo;
    case '>=': return valor >= objetivo;
    case '<=': return valor <= objetivo;
  }
}

/**
 * Las tres métricas a partir de las cifras de una zona o de un grupo.
 *
 * El filtro compara contra lo que se ve: la proyección sin recortar.
 */
export function metricValues(
  cifras: {
    active_start?: number;
    active_end?: number;
    new_subs?: number;
    growth?: number;
    churn?: number;
  },
  meta: Meta,
  { projection: proyeccion }: { projection: Proyeccion | null },
): MetricValues {
  const { projectedSalesCompliance: cumplimientoVentasProyectado } = calcCommercial(
    Number(cifras.active_start ?? 0),
    Number(cifras.active_end ?? 0),
    meta,
    { new_subs: Number(cifras.new_subs ?? 0), projection: proyeccion },
  );
  return {
    growth: Number(cifras.growth ?? 0),
    churn: Number(cifras.churn ?? 0),
    proyeccion: cumplimientoVentasProyectado,
  };
}
