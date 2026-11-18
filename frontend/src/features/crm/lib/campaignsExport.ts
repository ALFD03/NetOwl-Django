/**
 * El reporte de campañas de CRM: una fila por campaña del corte en pantalla.
 *
 * Son las filas `campana` del análisis tal cual, las mismas que pinta la tabla
 * de Analytics con esa dimensión elegida; aquí solo se eligen y ordenan las
 * columnas que pide el reporte.
 */

import type { ExcelColumn } from '@/shared/lib/excel';
import { toNumber } from '@/shared/utils';
import type { CrmDimensionValue } from '../types';

const INT = '#,##0';
const DEC = '0.00';
const HRS = '0.0';

const num = (value: number | undefined) => toNumber(value);

/**
 * Una hora que falta sale vacía, no en cero: una campaña sin instalaciones no
 * instala en 0 h, simplemente no tiene muestra.
 */
const hours = (value: number | null | undefined) => (value == null ? null : value);

/** De la campaña con más oportunidades a la que menos. */
export const sortCampaigns = (rows: CrmDimensionValue[]): CrmDimensionValue[] =>
  [...rows].sort(
    (a, b) => num(b.total_opportunities) - num(a.total_opportunities) || a.value.localeCompare(b.value),
  );

/**
 * Las columnas, en el orden en que el negocio las pidió. Los porcentajes salen
 * como la cifra que se lee (12.5, no 0.125), como en la tabla.
 */
export const CAMPAIGNS_EXCEL_COLUMNS: ExcelColumn<CrmDimensionValue>[] = [
  { header: 'Campaña', value: (r) => r.value, width: 30 },
  { header: 'Oportunidades', value: (r) => num(r.total_opportunities), format: INT },
  { header: 'Ganados', value: (r) => num(r.won), format: INT },
  { header: 'Perdidos', value: (r) => num(r.lost), format: INT },
  { header: 'Pendientes', value: (r) => num(r.pending), format: INT },
  { header: 'Tasa Instalaciones %', value: (r) => num(r.pct_installation), format: DEC },
  { header: 'Tasa Pérdida %', value: (r) => num(r.pct_lost), format: DEC },
  { header: 'Tasa Pendientes %', value: (r) => num(r.pct_pending), format: DEC },
  { header: 'Tasa Probabilidad Dev. E8 %', value: (r) => num(r.pct_returned_e8), format: DEC },
  { header: 'Inst. Prom (h)', value: (r) => hours(r.hours_avg_inst), format: HRS },
  { header: 'Inst. Med (h)', value: (r) => hours(r.hours_median_inst), format: HRS },
  { header: 'Inst. P25 (h)', value: (r) => hours(r.hours_p25_inst), format: HRS },
  { header: 'Inst. P75 (h)', value: (r) => hours(r.hours_p75_inst), format: HRS },
  { header: 'Excede Prom %', value: (r) => hours(r.pct_over_avg_inst), format: DEC },
];

/** `Campañas CRM 2026-09 día 15`: qué, de qué mes y de qué corte. */
export const campaignsFileName = (period: string, day: number): string =>
  ['Campañas CRM', period.slice(0, 7), day ? `día ${day}` : ''].join(' ').trim();
