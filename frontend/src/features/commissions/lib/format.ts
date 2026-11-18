/** Cómo se presentan las cifras y las clasificaciones del informe de comisiones. */

import type { Classification, CommissionPayment, SaleTier } from '../types';

const CURRENCY = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un monto en dólares, con dos decimales. */
export const formatAmount = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `$${CURRENCY.format(value)}`;

/**
 * Dólares a bolívares a `tasa`, redondeado a céntimos. Cada pago se convierte y
 * redondea por separado, y los totales en bolívares son la suma de esas cifras:
 * así una columna de la nómina suma exactamente su total. Nulo sin tasa.
 */
export const aBs = (dollars: number, rate: number | null): number | null =>
  rate === null ? null : Math.round(dollars * rate * 100) / 100;

/** El total en bolívares de varios pagos: la suma de cada uno ya redondeado. */
export const totalBs = (amounts: number[], rate: number | null): number | null =>
  rate === null ? null : Math.round(amounts.reduce((t, m) => t + (aBs(m, rate) ?? 0), 0) * 100) / 100;

/** Un monto en bolívares, con dos decimales. */
export const formatBs = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `Bs ${CURRENCY.format(value)}`;

const RATE = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Una tasa de bolívares por dólar, con hasta cuatro decimales. */
export const formatRate = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${RATE.format(value)} Bs/$`;

/** Un mes `YYYY-MM` como `octubre 2026`. */
export const formatMonth = (period: string): string => {
  const [year, month] = period.split('-').map(Number);
  return month ? new Date(year, month - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }) : period;
};

/** Solo el nombre del mes de un `YYYY-MM`: `octubre`. */
export const monthName = (period: string): string => {
  const [year, month] = period.split('-').map(Number);
  return month ? new Date(year, month - 1, 1).toLocaleDateString('es-VE', { month: 'long' }) : period;
};

/** El `YYYY-MM` del mes siguiente. */
export const nextMonth = (period: string): string => {
  const [year, month] = period.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
};

/** El día anterior a una fecha ISO. */
export const previousDay = (iso: string): string => {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** Un porcentaje con hasta dos decimales, o un guion si no hay valor. */
export const formatPctValue = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${CURRENCY.format(value)}%`;

/** Una fecha ISO como `25/08/2026`. */
export const formatDateValue = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return day ? `${day}/${month}/${year}` : iso;
};

export const CLASSIFICATION: Record<Classification, { label: string; tone: string }> = {
  valida: { label: 'Válida', tone: 'text-emerald-400' },
  no_pagada: { label: 'No pagada', tone: 'text-rose-400' },
  revision: { label: 'En revisión', tone: 'text-amber-400' },
  excluida: { label: 'Excluida', tone: 'text-slate-400' },
  diferida: { label: 'Al siguiente', tone: 'text-sky-400' },
};

export const TIER: Record<SaleTier, string> = {
  promo_anterior: 'Días promo. mes anterior',
  regular: 'Mes',
  promo: 'Días promocionales',
  manual: 'Agregada a mano',
};



/** De dónde sale el % de cumplimiento aplicado, en pocas palabras. */
export function complianceSource(p: CommissionPayment): string {
  const f = p.compliance;
  if (!f) return 'sin definir';
  switch (f.source) {
    case 'manual': return 'escrito a mano';
    case 'site': return `site ${f.sources[0]?.name ?? ''}`.trim();
    case 'unidad':
      return f.sources.length > 1 ? `promedio de ${f.sources.length} unidades` : `unidad ${f.sources[0]?.name ?? ''}`.trim();
    default: return 'sin definir';
  }
}

const pctSource = (s: { name: string; pct: number | null }) => `${s.name} ${s.pct === null ? 'sin %' : formatPctValue(s.pct)}`;

/** Todo lo calculado para el cumplimiento, se aplique o no: los sites o unidades y lo personal. */
export function complianceDetail(p: CommissionPayment): string {
  const f = p.compliance;
  if (!f) return '';
  const parts: string[] = [];
  if (f.sources.length) {
    const label = f.factor === 'site' ? 'Site' : 'Unidades';
    parts.push(`${label}: ${f.sources.map(pctSource).join(' · ')}${f.sources.length > 1 && f.computed !== null ? ` → ${formatPctValue(f.computed)}` : ''}`);
  } else {
    parts.push(f.factor === 'site' ? 'Sin site asignado' : 'Sin unidad de negocio: escríbelo a mano o asígnale su superior');
  }
  if (f.personal) {
    parts.push(f.personal.target
      ? `Personal: ${f.personal.sales} de ${f.personal.target} ventas (${formatPctValue(f.personal.pct)})`
      : `Personal: ${f.personal.sales} ventas, sin objetivo`);
  }
  return parts.join(' · ');
}
