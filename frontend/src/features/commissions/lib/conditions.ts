/**
 * Lo que la página de condiciones calcula para explicar la ventana de pago
 * mientras se lee o se edita.
 *
 * Las tarifas, tramos y bonos ya no están aquí: son las condiciones de cada rol
 * de cada equipo, en Catálogos › Ventas. Esto solo replica las comprobaciones de
 * `api_condiciones_guardar` para enseñar el efecto antes de guardar: la cifra
 * que cuenta es la del servidor, que vuelve a validarlo todo al recibirlo.
 */

import type { CommissionConditions } from '../types';

export type SimpleField = 'promo_day' | 'wait_days' | 'cutoff_day';

/** Lo que `api_condiciones_guardar` rechazaría de los campos sueltos. */
export function fieldErrors(c: CommissionConditions): Partial<Record<SimpleField, string>> {
  const errors: Partial<Record<SimpleField, string>> = {};
  if (!Number.isInteger(c.promo_day) || c.promo_day < 1 || c.promo_day > 31) {
    errors.promo_day = 'Un día del mes, de 1 a 31.';
  }
  if (!Number.isInteger(c.wait_days) || c.wait_days < 0 || c.wait_days > 60) {
    errors.wait_days = 'De 0 a 60 días.';
  }
  if (!Number.isInteger(c.cutoff_day) || c.cutoff_day < 1 || c.cutoff_day > 31) {
    errors.cutoff_day = 'Un día del mes, de 1 a 31.';
  }
  return errors;
}

// --- Cambios sin guardar -------------------------------------------------------------

/** Un cambio respecto a lo guardado. `antes` nulo es algo nuevo; `despues` nulo, algo quitado. */
export interface Change {
  where: string;
  before: string | null;
  after: string | null;
}

const FIELDS: Record<SimpleField, { where: string; value: (v: number) => string }> = {
  promo_day: { where: 'Periodo · inicio de los días promocionales', value: (v) => (Number.isFinite(v) ? `día ${v}` : '—') },
  wait_days: { where: 'Periodo · días de espera', value: (v) => (Number.isFinite(v) ? `${v} días` : '—') },
  cutoff_day: { where: 'Periodo · corte de los pagos adelantados', value: (v) => (Number.isFinite(v) ? `día ${v}` : '—') },
};

export function pendingChanges(saved: CommissionConditions, draft: CommissionConditions): Change[] {
  const changes: Change[] = [];
  for (const field of ['promo_day', 'wait_days', 'cutoff_day'] as const) {
    if (draft[field] !== saved[field]) {
      changes.push({ where: FIELDS[field].where, before: FIELDS[field].value(saved[field]), after: FIELDS[field].value(draft[field]) });
    }
  }
  return changes;
}

// --- Periodo -------------------------------------------------------------------------

/** El día `dia` de un mes, recortado al último si el mes es más corto: `calculo.dia_del_mes`. */
function dayOfMonth(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

export interface ExamplePeriod {
  /** `octubre de 2026`. */
  name: string;
  start: Date;
  /** El último día que cuenta sin condiciones: el anterior a los días promocionales. */
  end: Date;
  promoStart: Date;
  monthEndDate: Date;
  calc: Date;
  /** Hasta cuándo un pago adelantado de los días promocionales cuenta en el periodo. */
  cutoff: Date;
}

/**
 * Las fechas del periodo del mes de `hoy` si sus días promocionales y los del
 * mes anterior empiezan el día habitual. Es solo un ejemplo: cada periodo
 * confirma su propio inicio al crearlo. Nulo si los campos no son válidos.
 */
export function examplePeriod(
  promoDay: number, waitDays: number, cutoffDay: number, today = new Date(),
): ExamplePeriod | null {
  if (!Number.isInteger(promoDay) || promoDay < 1 || promoDay > 31) return null;
  if (!Number.isInteger(waitDays) || waitDays < 0) return null;
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) return null;
  const year = today.getFullYear();
  const month = today.getMonth();
  const promoStart = dayOfMonth(year, month, promoDay);
  const end = new Date(promoStart);
  end.setDate(end.getDate() - 1);
  const monthEnd = new Date(year, month + 1, 0);
  const calc = new Date(monthEnd);
  calc.setDate(calc.getDate() + waitDays);
  return {
    name: new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1)),
    start: dayOfMonth(year, month - 1, promoDay),
    end,
    promoStart,
    monthEndDate: monthEnd,
    calc,
    cutoff: dayOfMonth(year, month + 1, cutoffDay),
  };
}

/** `25/09`. */
export const dayAndMonth = (date: Date): string =>
  `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
