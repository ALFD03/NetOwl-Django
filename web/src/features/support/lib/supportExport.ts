/** Columnas y nombre de fichero de la exportación a Excel de soporte. */

import type { ExcelColumn } from '@/shared/lib/excel';
import { toNumber } from '@/shared/utils';
import type { SupportDimensionRow } from '../types';

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
  { header: 'Valor', value: (r) => r.nombre, width: 34 },
  { header: '% del Total', value: (r) => num(r.pctDelPadre), format: DEC },

  { header: 'Creados', value: (r) => num(r.tickets_creados), format: INT },
  { header: 'Cerrados', value: (r) => num(r.tickets_cerrados), format: INT },
  { header: 'Resueltos', value: (r) => num(r.tickets_resueltos), format: INT },
  { header: 'Cancelados', value: (r) => num(r.tickets_cancelados), format: INT },
  { header: 'Rezagados', value: (r) => num(r.tickets_rezagados), format: INT },

  { header: '% Resueltos', value: (r) => num(r.pct_resueltos), format: DEC },
  { header: '% Resueltos del Mes', value: (r) => num(r.pct_resueltos_periodo), format: DEC },
  { header: '% Resueltos Arrastre', value: (r) => num(r.pct_resueltos_arrastre), format: DEC },
  { header: '% Cancelados', value: (r) => num(r.pct_cancelados), format: DEC },
  { header: '% Cancelados del Mes', value: (r) => num(r.pct_cancelados_periodo), format: DEC },
  { header: '% Cancelados Arrastre', value: (r) => num(r.pct_cancelados_arrastre), format: DEC },
  { header: '% Rezago', value: (r) => num(r.pct_rezagados), format: DEC },

  { header: 'Cierre Total (h)', value: (r) => num(r.tiempo_medio_cierre_creado_cerrados_horas), format: HRS },
  { header: 'Cierre Total Med (h)', value: (r) => num(r.tiempo_mediana_cierre_creado_cerrados_horas), format: HRS },
  { header: 'Muestra Cierre', value: (r) => num(r.muestra_cierre_creado_cerrados), format: INT },

  { header: 'Gestión (h)', value: (r) => num(r.tiempo_medio_cierre_asignado_cerrados_horas), format: HRS },
  { header: 'Muestra Gestión', value: (r) => num(r.muestra_cierre_asignado_cerrados), format: INT },

  { header: 'Asignación (h)', value: (r) => num(r.tiempo_medio_asignacion_horas), format: HRS },
  { header: 'Muestra Asignación', value: (r) => num(r.muestra_asignacion), format: INT },
];

/**
 * Nombre del archivo: qué cuadro, de quién y de cuándo.
 *
 * Los tres datos van en el nombre porque el mismo cuadro se exporta una vez por
 * grupo, dimensión y periodo, y sin ellos los archivos son indistinguibles en
 * la carpeta de descargas.
 */
export function supportExportFileName(partes: Array<string | undefined>): string {
  return ['Soporte', ...partes.filter((p): p is string => Boolean(p && p.trim()))].join(' - ');
}
