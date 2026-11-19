/** Formatos de Encuestas. */

import type { RespondentStatus } from '../types';

/** `2026-10` → `octubre de 2026`. */
export const formatMonth = (period: string): string => {
  const [year, month] = period.split('-').map(Number);
  return month ? new Date(year, month - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }) : period;
};

/** El mes en que se llama la encuesta de `period`: el siguiente. */
export const callMonth = (period: string): string => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 1).toLocaleDateString('es-VE', { month: 'long' });
};

export const STATUS_LABEL: Record<RespondentStatus, string> = {
  pendiente: 'Pendiente',
  completada: 'Completada',
  no_contesta: 'No contesta',
  rechazo: 'Rechazó',
};

/** Clases del chip de cada estado. */
export const STATUS_CHIP: Record<RespondentStatus, string> = {
  pendiente: 'border-slate-600/60 bg-slate-700/30 text-slate-300',
  completada: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  no_contesta: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  rechazo: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
};

export const pct = (part: number, total: number): string => (total ? `${Math.round((100 * part) / total)}%` : '—');

/** La ficha del cliente, en el orden en que se muestra y se exporta. */
export const CARD_FIELDS = [
  { key: 'order', label: 'Id de Sub' },
  { key: 'client', label: 'Nombre' },
  { key: 'ci', label: 'CI' },
  { key: 'seller', label: 'Vendedor' },
  { key: 'channel', label: 'Medio' },
  { key: 'branch', label: 'Sucursal' },
  { key: 'zone', label: 'Zona' },
  { key: 'service_type', label: 'Tipo de servicio' },
  { key: 'campaign', label: 'Campaña' },
  { key: 'phone1', label: 'Phone 1' },
  { key: 'phone2', label: 'Phone 2' },
] as const;
