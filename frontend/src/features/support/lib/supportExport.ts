/** Columnas y nombre de fichero de la exportación a Excel de soporte. */

import type { ExcelColumn } from '@/shared/lib/excel';
import { toNumber } from '@/shared/utils';
import type { SupportDepartmentRow, SupportDimensionRow } from '../types';

const INT = '#,##0';
const DEC = '0.00';
const HRS = '0.0';

const num = (value: number | undefined) => toNumber(value);

/**
 * The dimension table as a spreadsheet: same columns, same order, raw numbers.
 *
 * It mirrors `SUPPORT_DIMENSION_COLUMNS` on purpose — what gets exported has to
 * be the cuadro that is on screen — but emits the value behind each cell rather
 * than its rendered string, so Excel can sort, filter and sum it. Percentages
 * go out as the same figure the table shows (89.32, not 0.8932) and hours as
 * hours; the format only decides how many decimals Excel displays.
 */
export const SUPPORT_DIMENSION_EXCEL_COLUMNS: ExcelColumn<SupportDimensionRow>[] = [
  { header: 'Valor', value: (r) => r.name, width: 34 },
  { header: '% del Total', value: (r) => num(r.pctOfParent), format: DEC },

  { header: 'Creados', value: (r) => num(r.tickets_created), format: INT },
  { header: 'Cerrados', value: (r) => num(r.tickets_closed), format: INT },
  { header: 'Resueltos', value: (r) => num(r.tickets_resolved), format: INT },
  { header: 'Cancelados', value: (r) => num(r.tickets_cancelled), format: INT },
  { header: 'Escalados', value: (r) => num(r.tickets_escalated), format: INT },
  { header: 'Llegados de ATC', value: (r) => num(r.tickets_received_escalated), format: INT },
  { header: 'Rezagados', value: (r) => num(r.tickets_lagging), format: INT },

  { header: '% Resueltos', value: (r) => num(r.pct_resolved), format: DEC },
  { header: '% Resueltos del Mes', value: (r) => num(r.pct_resolved_in_period), format: DEC },
  { header: '% Resueltos Arrastre', value: (r) => num(r.pct_resolved_carryover), format: DEC },
  { header: '% Cancelados', value: (r) => num(r.pct_cancelled), format: DEC },
  { header: '% Cancelados del Mes', value: (r) => num(r.pct_cancelled_in_period), format: DEC },
  { header: '% Cancelados Arrastre', value: (r) => num(r.pct_cancelled_carryover), format: DEC },
  { header: '% Escalados', value: (r) => num(r.pct_escalated), format: DEC },
  { header: '% Rezago', value: (r) => num(r.pct_lagging), format: DEC },

  { header: 'Cierre Total (h)', value: (r) => num(r.time_mean_close_created_closed_hours), format: HRS },
  { header: 'Cierre Total Mediana (h)', value: (r) => num(r.time_median_close_created_closed_hours), format: HRS },
  { header: 'Muestra Cierre', value: (r) => num(r.sample_close_created_closed), format: INT },

  { header: 'Gestión (h)', value: (r) => num(r.time_mean_close_assigned_closed_hours), format: HRS },
  { header: 'Muestra Gestión', value: (r) => num(r.sample_close_assigned_closed), format: INT },

  { header: 'Asignación (h)', value: (r) => num(r.time_mean_assignment_hours), format: HRS },
  { header: 'Muestra Asignación', value: (r) => num(r.sample_assignment), format: INT },

  { header: 'Hasta Escalar (h)', value: (r) => num(r.time_mean_escalation_hours), format: HRS },
  { header: 'Muestra Hasta Escalar', value: (r) => num(r.sample_escalation), format: INT },
];

/**
 * Nombre del archivo: qué cuadro, de quién y de cuándo.
 *
 * Los tres datos van en el nombre porque el mismo cuadro se exporta una vez por
 * grupo, dimensión y periodo, y sin ellos los archivos son indistinguibles en
 * la carpeta de descargas.
 */
export function supportExportFileName(parts: Array<string | undefined>): string {
  return ['Soporte', ...parts.filter((p): p is string => Boolean(p && p.trim()))].join(' - ');
}

/**
 * La tabla de departamentos como hoja de cálculo.
 *
 * Mismo criterio que la de personas —lo exportado es el cuadro de la pantalla—,
 * así que tampoco lleva la mediana: ver `SUPPORT_DEPARTMENT_COLUMNS`.
 */
export const SUPPORT_DEPARTMENT_EXCEL_COLUMNS: ExcelColumn<SupportDepartmentRow>[] = [
  { header: 'Departamento', value: (r) => r.name, width: 34 },
  { header: 'Personas', value: (r) => num(r.people), format: INT },
  ...SUPPORT_DIMENSION_EXCEL_COLUMNS.filter(
    (col) => col.header !== 'Valor' && col.header !== 'Cierre Total Mediana (h)',
  ),
] as ExcelColumn<SupportDepartmentRow>[];
