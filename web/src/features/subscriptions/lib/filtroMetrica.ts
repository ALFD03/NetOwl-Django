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

import type { Proyeccion } from '@/shared/lib/proyeccion';

import { calcComercial } from './commercial';
import type { Meta } from './objetivos';

export type MetricaFiltro = 'crecimiento' | 'churn' | 'proyeccion';
export type OperadorFiltro = '=' | '!=' | '>' | '<' | '>=' | '<=';
/** `zona`: cada fila de la tabla. `grupo`: el site o el coordinador, por sus totales. */
export type NivelFiltro = 'zona' | 'grupo';

export interface FiltroMetrica {
  metrica: MetricaFiltro;
  operador: OperadorFiltro;
  /** Tal como se escribió: vacío es «sin filtro». */
  valor: string;
  nivel: NivelFiltro;
}

export const FILTRO_METRICA_VACIO: FiltroMetrica = {
  metrica: 'crecimiento',
  operador: '>=',
  valor: '',
  nivel: 'zona',
};

export const METRICAS_FILTRO: { value: MetricaFiltro; label: string }[] = [
  { value: 'crecimiento', label: 'Crecimiento %' },
  { value: 'churn', label: 'Churn %' },
  { value: 'proyeccion', label: 'Proyección %' },
];

export const OPERADORES_FILTRO: OperadorFiltro[] = ['=', '!=', '>', '<', '>=', '<='];

/** Lo que el campo admite mientras se escribe: un número con signo y decimales con punto o coma. */
export const PATRON_VALOR_FILTRO = /^-?\d*([.,]\d*)?$/;

/** Las tres métricas de una zona o de un grupo. `proyeccion` es `null` sin un día de corte. */
export interface ValoresMetrica {
  crecimiento: number;
  churn: number;
  /** El cumplimiento de ventas proyectado al cierre, en % del objetivo. */
  proyeccion: number | null;
}

/**
 * El umbral del filtro, o `null` si no filtra: sin valor, con un valor que no
 * es todavía un número («-», «3,») o filtrando por proyección sin un día que
 * proyectar.
 */
export function umbralFiltro(filtro: FiltroMetrica, proyeccion: Proyeccion | null): number | null {
  if (filtro.metrica === 'proyeccion' && !proyeccion) return null;
  const texto = filtro.valor.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(texto)) return null;
  return Number(texto);
}

const dosDecimales = (valor: number) => Math.round(valor * 100) / 100;

/** Si los valores cumplen el filtro. Con `umbral` nulo no se filtra nada. */
export function cumpleFiltro(valores: ValoresMetrica, filtro: FiltroMetrica, umbral: number | null): boolean {
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
 * `clamp` es el del reporte (ver `calcComercial`): Ventas recorta la proyección
 * a 100 y Unidades de Negocio no, y el filtro compara contra lo que se ve.
 */
export function valoresMetrica(
  cifras: {
    activos_inicio?: number;
    activos_final?: number;
    nuevos?: number;
    crecimiento?: number;
    churn?: number;
  },
  meta: Meta,
  { clamp, proyeccion }: { clamp: boolean; proyeccion: Proyeccion | null },
): ValoresMetrica {
  const { cumplimientoVentasProyectado } = calcComercial(
    Number(cifras.activos_inicio ?? 0),
    Number(cifras.activos_final ?? 0),
    meta.metaCrecimiento,
    { clamp, nuevos: Number(cifras.nuevos ?? 0), proyeccion },
  );
  return {
    crecimiento: Number(cifras.crecimiento ?? 0),
    churn: Number(cifras.churn ?? 0),
    proyeccion: cumplimientoVentasProyectado,
  };
}
