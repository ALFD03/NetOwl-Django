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

export type CampoSimple = 'promo_day' | 'wait_days' | 'cutoff_day';

/** Lo que `api_condiciones_guardar` rechazaría de los campos sueltos. */
export function fieldErrors(c: CommissionConditions): Partial<Record<CampoSimple, string>> {
  const errores: Partial<Record<CampoSimple, string>> = {};
  if (!Number.isInteger(c.promo_day) || c.promo_day < 1 || c.promo_day > 31) {
    errores.promo_day = 'Un día del mes, de 1 a 31.';
  }
  if (!Number.isInteger(c.wait_days) || c.wait_days < 0 || c.wait_days > 60) {
    errores.wait_days = 'De 0 a 60 días.';
  }
  if (!Number.isInteger(c.cutoff_day) || c.cutoff_day < 1 || c.cutoff_day > 31) {
    errores.cutoff_day = 'Un día del mes, de 1 a 31.';
  }
  return errores;
}

// --- Cambios sin guardar -------------------------------------------------------------

/** Un cambio respecto a lo guardado. `antes` nulo es algo nuevo; `despues` nulo, algo quitado. */
export interface Change {
  donde: string;
  antes: string | null;
  despues: string | null;
}

const CAMPOS: Record<CampoSimple, { donde: string; value: (v: number) => string }> = {
  promo_day: { donde: 'Periodo · inicio de los días promocionales', value: (v) => (Number.isFinite(v) ? `día ${v}` : '—') },
  wait_days: { donde: 'Periodo · días de espera', value: (v) => (Number.isFinite(v) ? `${v} días` : '—') },
  cutoff_day: { donde: 'Periodo · corte de los pagos adelantados', value: (v) => (Number.isFinite(v) ? `día ${v}` : '—') },
};

export function pendingChanges(guardadas: CommissionConditions, borrador: CommissionConditions): Change[] {
  const cambios: Change[] = [];
  for (const campo of ['promo_day', 'wait_days', 'cutoff_day'] as const) {
    if (borrador[campo] !== guardadas[campo]) {
      cambios.push({ donde: CAMPOS[campo].donde, antes: CAMPOS[campo].value(guardadas[campo]), despues: CAMPOS[campo].value(borrador[campo]) });
    }
  }
  return cambios;
}

// --- Periodo -------------------------------------------------------------------------

/** El día `dia` de un mes, recortado al último si el mes es más corto: `calculo.dia_del_mes`. */
function dayOfMonth(anio: number, mes: number, dia: number): Date {
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  return new Date(anio, mes, Math.min(dia, ultimo));
}

export interface ExamplePeriod {
  /** `octubre de 2026`. */
  name: string;
  start: Date;
  /** El último día que cuenta sin condiciones: el anterior a los días promocionales. */
  end: Date;
  promoStart: Date;
  monthEndDate: Date;
  calculo: Date;
  /** Hasta cuándo un pago adelantado de los días promocionales cuenta en el periodo. */
  corte: Date;
}

/**
 * Las fechas del periodo del mes de `hoy` si sus días promocionales y los del
 * mes anterior empiezan el día habitual. Es solo un ejemplo: cada periodo
 * confirma su propio inicio al crearlo. Nulo si los campos no son válidos.
 */
export function examplePeriod(
  promoDay: number, waitDays: number, diaCorte: number, today = new Date(),
): ExamplePeriod | null {
  if (!Number.isInteger(promoDay) || promoDay < 1 || promoDay > 31) return null;
  if (!Number.isInteger(waitDays) || waitDays < 0) return null;
  if (!Number.isInteger(diaCorte) || diaCorte < 1 || diaCorte > 31) return null;
  const anio = today.getFullYear();
  const mes = today.getMonth();
  const inicioPromo = dayOfMonth(anio, mes, promoDay);
  const fin = new Date(inicioPromo);
  fin.setDate(fin.getDate() - 1);
  const finDeMes = new Date(anio, mes + 1, 0);
  const calculo = new Date(finDeMes);
  calculo.setDate(calculo.getDate() + waitDays);
  return {
    name: new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(anio, mes, 1)),
    start: dayOfMonth(anio, mes - 1, promoDay),
    end: fin,
    promoStart: inicioPromo,
    monthEndDate: finDeMes,
    calculo,
    corte: dayOfMonth(anio, mes + 1, diaCorte),
  };
}

/** `25/09`. */
export const dayAndMonth = (fecha: Date): string =>
  `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`;
