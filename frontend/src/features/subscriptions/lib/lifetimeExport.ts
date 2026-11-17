/** Las columnas de la hoja de lifetime y los nombres legibles de sus valores. */

import type { ExcelColumn } from '@/shared/lib/excel';
import type { LifetimeBaja } from '@/shared/types/subscriptions';

/** El estado en que la baja cerró el mes, en el vocabulario de Odoo. */
export const ESTADO_CIERRE_LABEL: Record<string, string> = {
  '4_paused': 'En pausa',
  '8_30days': 'Más de 30 días suspendido',
  '6_churn': 'Cancelado',
};

export const estadoCierreLabel = (estado: string): string => ESTADO_CIERRE_LABEL[estado] ?? estado;

export const LIFETIME_COLUMNS: ExcelColumn<LifetimeBaja>[] = [
  { header: 'Orden', value: (b) => b.orden, width: 16 },
  { header: 'Sucursal', value: (b) => b.sucursal ?? null, width: 14 },
  { header: 'Zona', value: (b) => b.zona ?? null, width: 22 },
  { header: 'Municipio', value: (b) => b.municipio ?? null, width: 20 },
  { header: 'Campaña', value: (b) => b.campanna ?? null, width: 26 },
  { header: 'Instalación', value: (b) => b.f_ini, width: 13 },
  { header: 'Fecha de baja', value: (b) => b.f_baja, width: 13 },
  { header: 'Estado al cierre', value: (b) => estadoCierreLabel(b.estado_cierre), width: 24 },
  // Número, no texto: la hoja tiene que poder promediarlo y filtrarlo.
  { header: 'Días desde la instalación', value: (b) => b.dias_desde_instalacion, format: '#,##0', width: 14 },
];

export const lifetimeFileName = (mes: string): string => `Lifetime bajas ${mes}`;
