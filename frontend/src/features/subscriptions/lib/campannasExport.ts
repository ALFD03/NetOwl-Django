/**
 * El reporte de campañas de suscripciones: una fila por campaña del corte en
 * pantalla, con sus metas y cumplimientos.
 *
 * No hay cálculo nuevo. Cada cifra es la fila `campanna` del análisis, la
 * misma que pinta la tabla de Analytics, y lo único que se compone aquí son las
 * razones que la fila no trae (aporte, ingresos netos, tasa de recuperación) y
 * la meta.
 */

import type { ExcelColumn } from '@/shared/lib/excel';
import type { DimensionVal } from '@/shared/types/domain';
import { toNumber } from '@/shared/utils';
import { cumplimientoDelPeriodo, mesDe, type Objetivo } from './objetivos';

const INT = '#,##0';
const DEC = '0.00';

export interface CampannaReporte {
  campanna: string;
  baseInicio: number;
  aporte: number;
  instalaciones: number;
  reactivaciones: number;
  ingresosNetos: number;
  bajas: number;
  ingresosBrutos: number;
  churn: number;
  crecimiento: number;
  meta: number;
  cumplimientoVentas: number;
  cumplimientoIngresos: number;
  cumplimientoCierre: number;
  suspensiones: number;
  tasaSuspensiones: number;
  recuperaciones: number;
  tasaRecuperacion: number;
  arpu: number;
  baseFinal: number;
}

const tasa = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);

/**
 * Las filas del reporte, de la campaña que más instala a la que menos.
 *
 * **La meta es la del objetivo general del mes.** Una campaña no es un nivel
 * del catálogo de objetivos —esos son geográficos—, así que se mide igual que
 * los totales de Analytics: su base inicial por el crecimiento general, con
 * las tres metas de `cumplimientoDelPeriodo`. Sin recorte a 100, como allí.
 *
 * **El aporte se divide entre la suma de las campañas, no entre el global.**
 * Toda orden cae en alguna (la que no tiene va a `Sin campanna`), así que es la
 * misma cifra, y de este modo el aporte nunca mezcla un corte con otro si el
 * desglose cayó al cierre del mes por faltarle al día.
 */
export function construirReporteCampannas(
  filas: DimensionVal[],
  objetivo: Objetivo,
): CampannaReporte[] {
  const instalacionesTotales = filas.reduce((total, fila) => total + toNumber(fila.nuevos), 0);

  return filas
    .map((fila) => {
      const instalaciones = toNumber(fila.nuevos);
      const reactivaciones = toNumber(fila.react_val);
      const suspensiones = toNumber(fila.corte_impagado);
      const recuperaciones = toNumber(fila.react_4_P);
      const cumplimiento = cumplimientoDelPeriodo({ ...fila, nuevos_mes: fila.nuevos }, objetivo);

      return {
        campanna: fila.valor,
        baseInicio: toNumber(fila.activos_inicio),
        aporte: tasa(instalaciones, instalacionesTotales),
        instalaciones,
        reactivaciones,
        ingresosNetos: instalaciones + reactivaciones,
        bajas: toNumber(fila.bajas),
        ingresosBrutos: toNumber(fila.adiciones_brutas),
        churn: toNumber(fila.churn_bruto_pct),
        crecimiento: toNumber(fila.crecimiento),
        meta: cumplimiento.metaIngresos,
        cumplimientoVentas: cumplimiento.cumplimientoVentas,
        cumplimientoIngresos: cumplimiento.cumplimientoIngresos,
        cumplimientoCierre: cumplimiento.cumplimientoCierre,
        suspensiones,
        tasaSuspensiones: toNumber(fila.porcentaje_suspensiones),
        recuperaciones,
        tasaRecuperacion: tasa(recuperaciones, suspensiones),
        arpu: toNumber(fila.arpu),
        baseFinal: toNumber(fila.activos_final),
      };
    })
    .sort((a, b) => b.instalaciones - a.instalaciones || a.campanna.localeCompare(b.campanna));
}

/**
 * Las columnas, en el orden en que el negocio las pidió.
 *
 * Los porcentajes salen como la cifra que se lee (12.5, no 0.125), igual que en
 * el resto de exportaciones; el formato solo decide los decimales.
 */
export const CAMPANNAS_EXCEL_COLUMNS: ExcelColumn<CampannaReporte>[] = [
  { header: 'Campaña', value: (r) => r.campanna, width: 30 },
  { header: 'Base Inicio', value: (r) => r.baseInicio, format: INT },
  { header: 'Aporte %', value: (r) => r.aporte, format: DEC },
  { header: 'Instalaciones', value: (r) => r.instalaciones, format: INT },
  { header: 'Reactivaciones', value: (r) => r.reactivaciones, format: INT },
  { header: 'Ingresos Netos', value: (r) => r.ingresosNetos, format: INT },
  { header: 'Bajas', value: (r) => r.bajas, format: INT },
  { header: 'Ingresos Brutos', value: (r) => r.ingresosBrutos, format: INT },
  { header: 'Churn %', value: (r) => r.churn, format: DEC },
  { header: 'Crecimiento %', value: (r) => r.crecimiento, format: DEC },
  { header: 'Meta', value: (r) => r.meta, format: DEC },
  { header: 'Cumpl. Ventas %', value: (r) => r.cumplimientoVentas, format: DEC },
  { header: 'Cumpl. Ingresos %', value: (r) => r.cumplimientoIngresos, format: DEC },
  { header: 'Cumpl. Cierre %', value: (r) => r.cumplimientoCierre, format: DEC },
  { header: 'Suspensiones', value: (r) => r.suspensiones, format: INT },
  { header: 'Tasa Suspensiones %', value: (r) => r.tasaSuspensiones, format: DEC },
  { header: 'Recuperaciones', value: (r) => r.recuperaciones, format: INT },
  { header: 'Tasa Recuperación %', value: (r) => r.tasaRecuperacion, format: DEC },
  { header: 'ARPU', value: (r) => r.arpu, format: DEC },
  { header: 'Base Final', value: (r) => r.baseFinal, format: INT },
];

/** `Campañas Suscripciones 2026-09 día 15`: qué, de qué mes y de qué corte. */
export const campannasFileName = (periodo: string, dia: number): string =>
  ['Campañas Suscripciones', mesDe(periodo), dia ? `día ${dia}` : ''].join(' ').trim();
