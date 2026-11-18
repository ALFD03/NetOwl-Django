/** Las columnas de la hoja de lifetime y los nombres legibles de sus valores. */

import type { ExcelColumn } from '@/shared/lib/excel';
import type { LifetimeChurn } from '@/shared/types/subscriptions';

/** El estado en que la baja cerró el mes, en el vocabulario de Odoo. */
export const CLOSE_STATE_LABEL: Record<string, string> = {
  '4_paused': 'En pausa',
  '8_30days': 'Más de 30 días suspendido',
  '6_churn': 'Cancelado',
};

export const closeStateLabel = (state: string): string => CLOSE_STATE_LABEL[state] ?? state;

export const LIFETIME_COLUMNS: ExcelColumn<LifetimeChurn>[] = [
  { header: 'Orden', value: (b) => b.order, width: 16 },
  { header: 'Sucursal', value: (b) => b.sucursal ?? null, width: 14 },
  { header: 'Zona', value: (b) => b.zona ?? null, width: 22 },
  { header: 'Municipio', value: (b) => b.municipio ?? null, width: 20 },
  { header: 'Campaña', value: (b) => b.campanna ?? null, width: 26 },
  { header: 'Instalación', value: (b) => b.start_date, width: 13 },
  { header: 'Fecha de baja', value: (b) => b.churn_date, width: 13 },
  { header: 'Estado al cierre', value: (b) => closeStateLabel(b.close_status), width: 24 },
  // Número, no texto: la hoja tiene que poder promediarlo y filtrarlo.
  { header: 'Días desde la instalación', value: (b) => b.days_since_install, format: '#,##0', width: 14 },
];

export const lifetimeFileName = (month: string): string => `Lifetime bajas ${month}`;
