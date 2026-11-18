/** Cómo se presentan las cifras y las clasificaciones del informe de comisiones. */

import type { Classification, CommissionPayment, SaleTier } from '../types';

const MONEDA = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un monto en dólares, con dos decimales. */
export const formatAmount = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `$${MONEDA.format(valor)}`;

/**
 * Dólares a bolívares a `tasa`, redondeado a céntimos. Cada pago se convierte y
 * redondea por separado, y los totales en bolívares son la suma de esas cifras:
 * así una columna de la nómina suma exactamente su total. Nulo sin tasa.
 */
export const aBs = (dolares: number, tasa: number | null): number | null =>
  tasa === null ? null : Math.round(dolares * tasa * 100) / 100;

/** El total en bolívares de varios pagos: la suma de cada uno ya redondeado. */
export const totalBs = (amounts: number[], tasa: number | null): number | null =>
  tasa === null ? null : Math.round(amounts.reduce((t, m) => t + (aBs(m, tasa) ?? 0), 0) * 100) / 100;

/** Un monto en bolívares, con dos decimales. */
export const formatBs = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `Bs ${MONEDA.format(valor)}`;

const RATE = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Una tasa de bolívares por dólar, con hasta cuatro decimales. */
export const formatRate = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `${RATE.format(valor)} Bs/$`;

/** Un mes `YYYY-MM` como `octubre 2026`. */
export const formatMonth = (periodo: string): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes ? new Date(anio, mes - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }) : periodo;
};

/** Solo el nombre del mes de un `YYYY-MM`: `octubre`. */
export const monthName = (periodo: string): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes ? new Date(anio, mes - 1, 1).toLocaleDateString('es-VE', { month: 'long' }) : periodo;
};

/** El `YYYY-MM` del mes siguiente. */
export const nextMonth = (periodo: string): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`;
};

/** El día anterior a una fecha ISO. */
export const previousDay = (iso: string): string => {
  const fecha = new Date(`${iso.slice(0, 10)}T12:00:00`);
  fecha.setDate(fecha.getDate() - 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
};

/** Un porcentaje con hasta dos decimales, o un guion si no hay valor. */
export const formatPctValue = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `${MONEDA.format(valor)}%`;

/** Una fecha ISO como `25/08/2026`. */
export const formatDateValue = (iso: string): string => {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return dia ? `${dia}/${mes}/${anio}` : iso;
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
  const f = p.cumplimiento;
  if (!f) return 'sin definir';
  switch (f.fuente) {
    case 'manual': return 'escrito a mano';
    case 'site': return `site ${f.fuentes[0]?.nombre ?? ''}`.trim();
    case 'unidad':
      return f.fuentes.length > 1 ? `promedio de ${f.fuentes.length} unidades` : `unidad ${f.fuentes[0]?.nombre ?? ''}`.trim();
    default: return 'sin definir';
  }
}

const pctSource = (s: { nombre: string; pct: number | null }) => `${s.nombre} ${s.pct === null ? 'sin %' : formatPctValue(s.pct)}`;

/** Todo lo calculado para el cumplimiento, se aplique o no: los sites o unidades y lo personal. */
export function complianceDetail(p: CommissionPayment): string {
  const f = p.cumplimiento;
  if (!f) return '';
  const partes: string[] = [];
  if (f.fuentes.length) {
    const etiqueta = f.factor === 'site' ? 'Site' : 'Unidades';
    partes.push(`${etiqueta}: ${f.fuentes.map(pctSource).join(' · ')}${f.fuentes.length > 1 && f.calculado !== null ? ` → ${formatPctValue(f.calculado)}` : ''}`);
  } else {
    partes.push(f.factor === 'site' ? 'Sin site asignado' : 'Sin unidad de negocio: escríbelo a mano o asígnale su superior');
  }
  if (f.personal) {
    partes.push(f.personal.objetivo
      ? `Personal: ${f.personal.ventas} de ${f.personal.objetivo} ventas (${formatPctValue(f.personal.pct)})`
      : `Personal: ${f.personal.ventas} ventas, sin objetivo`);
  }
  return partes.join(' · ');
}
