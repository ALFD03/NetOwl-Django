/** Cómo se presentan las cifras y las clasificaciones del informe de comisiones. */

import type { Clasificacion } from '../types';

const MONEDA = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un monto en dólares, con dos decimales. */
export const formatoMonto = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `$${MONEDA.format(valor)}`;

/**
 * Dólares a bolívares a `tasa`, redondeado a céntimos. Cada pago se convierte y
 * redondea por separado, y los totales en bolívares son la suma de esas cifras:
 * así una columna de la nómina suma exactamente su total. Nulo sin tasa.
 */
export const aBs = (dolares: number, tasa: number | null): number | null =>
  tasa === null ? null : Math.round(dolares * tasa * 100) / 100;

/** El total en bolívares de varios pagos: la suma de cada uno ya redondeado. */
export const totalBs = (montos: number[], tasa: number | null): number | null =>
  tasa === null ? null : Math.round(montos.reduce((t, m) => t + (aBs(m, tasa) ?? 0), 0) * 100) / 100;

/** Un monto en bolívares, con dos decimales. */
export const formatoBs = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `Bs ${MONEDA.format(valor)}`;

const TASA = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Una tasa de bolívares por dólar, con hasta cuatro decimales. */
export const formatoTasa = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `${TASA.format(valor)} Bs/$`;

/** Un mes `YYYY-MM` como `octubre 2026`. */
export const formatoMes = (periodo: string): string => {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes ? new Date(anio, mes - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }) : periodo;
};

/** Un porcentaje con hasta dos decimales, o un guion si no hay valor. */
export const formatoPct = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `${MONEDA.format(valor)}%`;

/** Una fecha ISO como `25/08/2026`. */
export const formatoFecha = (iso: string): string => {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return dia ? `${dia}/${mes}/${anio}` : iso;
};

export const CLASIFICACION: Record<Clasificacion, { label: string; tone: string }> = {
  valida: { label: 'Válida', tone: 'text-emerald-400' },
  no_pagada: { label: 'No pagada', tone: 'text-rose-400' },
  revision: { label: 'En revisión', tone: 'text-amber-400' },
  excluida: { label: 'Excluida', tone: 'text-slate-400' },
};


