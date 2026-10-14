/** Cómo se presentan las cifras y las clasificaciones del informe de comisiones. */

import type { CargoVentas, Clasificacion } from '../types';

const MONEDA = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un monto en dólares, con dos decimales. */
export const formatoMonto = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `$${MONEDA.format(valor)}`;

/** Un porcentaje con hasta dos decimales, o un guion si no hay valor. */
export const formatoPct = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '—' : `${MONEDA.format(valor)}%`;

/** Una fecha ISO como `25/08/2026`. */
export const formatoFecha = (iso: string): string => {
  const [anio, mes, dia] = iso.split('-');
  return dia ? `${dia}/${mes}/${anio}` : iso;
};

export const CLASIFICACION: Record<Clasificacion, { label: string; tone: string }> = {
  valida: { label: 'Válida', tone: 'text-emerald-400' },
  no_pagada: { label: 'No pagada', tone: 'text-rose-400' },
  revision: { label: 'En revisión', tone: 'text-amber-400' },
  excluida: { label: 'Excluida', tone: 'text-slate-400' },
};

/** Los cargos en el orden en que se presentan: de quien vende a quien coordina. */
export const CARGOS: CargoVentas[] = ['asesor', 'supervisor', 'coord_oficina', 'coord_un'];

export const CARGO_CORTO: Record<CargoVentas, string> = {
  asesor: 'Asesores',
  supervisor: 'Supervisores',
  coord_oficina: 'Coord. de oficina',
  coord_un: 'Coord. de UN',
};

/** `YYYY-MM` del mes siguiente: a donde se difiere una venta por defecto. */
export function mesSiguiente(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`;
}
