/**
 * Lo que la página de condiciones calcula para explicar la ventana de pago
 * mientras se lee o se edita.
 *
 * Las tarifas, tramos y bonos ya no están aquí: son las condiciones de cada rol
 * de cada equipo, en Catálogos › Ventas. Esto solo replica las comprobaciones de
 * `api_condiciones_guardar` para enseñar el efecto antes de guardar: la cifra
 * que cuenta es la del servidor, que vuelve a validarlo todo al recibirlo.
 */

import type { CondicionesComision } from '../types';

export type CampoSimple = 'dia_promocional' | 'dias_espera' | 'dia_corte';

/** Lo que `api_condiciones_guardar` rechazaría de los campos sueltos. */
export function erroresCampos(c: CondicionesComision): Partial<Record<CampoSimple, string>> {
  const errores: Partial<Record<CampoSimple, string>> = {};
  if (!Number.isInteger(c.dia_promocional) || c.dia_promocional < 1 || c.dia_promocional > 31) {
    errores.dia_promocional = 'Un día del mes, de 1 a 31.';
  }
  if (!Number.isInteger(c.dias_espera) || c.dias_espera < 0 || c.dias_espera > 60) {
    errores.dias_espera = 'De 0 a 60 días.';
  }
  if (!Number.isInteger(c.dia_corte) || c.dia_corte < 1 || c.dia_corte > 31) {
    errores.dia_corte = 'Un día del mes, de 1 a 31.';
  }
  return errores;
}

// --- Cambios sin guardar -------------------------------------------------------------

/** Un cambio respecto a lo guardado. `antes` nulo es algo nuevo; `despues` nulo, algo quitado. */
export interface Cambio {
  donde: string;
  antes: string | null;
  despues: string | null;
}

const CAMPOS: Record<CampoSimple, { donde: string; valor: (v: number) => string }> = {
  dia_promocional: { donde: 'Periodo · inicio de los días promocionales', valor: (v) => (Number.isFinite(v) ? `día ${v}` : '—') },
  dias_espera: { donde: 'Periodo · días de espera', valor: (v) => (Number.isFinite(v) ? `${v} días` : '—') },
  dia_corte: { donde: 'Periodo · corte de los pagos adelantados', valor: (v) => (Number.isFinite(v) ? `día ${v}` : '—') },
};

export function cambiosPendientes(guardadas: CondicionesComision, borrador: CondicionesComision): Cambio[] {
  const cambios: Cambio[] = [];
  for (const campo of ['dia_promocional', 'dias_espera', 'dia_corte'] as const) {
    if (borrador[campo] !== guardadas[campo]) {
      cambios.push({ donde: CAMPOS[campo].donde, antes: CAMPOS[campo].valor(guardadas[campo]), despues: CAMPOS[campo].valor(borrador[campo]) });
    }
  }
  return cambios;
}

// --- Periodo -------------------------------------------------------------------------

/** El día `dia` de un mes, recortado al último si el mes es más corto: `calculo.dia_del_mes`. */
function diaDelMes(anio: number, mes: number, dia: number): Date {
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  return new Date(anio, mes, Math.min(dia, ultimo));
}

export interface PeriodoEjemplo {
  /** `octubre de 2026`. */
  nombre: string;
  inicio: Date;
  /** El último día que cuenta sin condiciones: el anterior a los días promocionales. */
  fin: Date;
  inicioPromo: Date;
  finDeMes: Date;
  calculo: Date;
  /** Hasta cuándo un pago adelantado de los días promocionales cuenta en el periodo. */
  corte: Date;
}

/**
 * Las fechas del periodo del mes de `hoy` si sus días promocionales y los del
 * mes anterior empiezan el día habitual. Es solo un ejemplo: cada periodo
 * confirma su propio inicio al crearlo. Nulo si los campos no son válidos.
 */
export function periodoEjemplo(
  diaPromocional: number, diasEspera: number, diaCorte: number, hoy = new Date(),
): PeriodoEjemplo | null {
  if (!Number.isInteger(diaPromocional) || diaPromocional < 1 || diaPromocional > 31) return null;
  if (!Number.isInteger(diasEspera) || diasEspera < 0) return null;
  if (!Number.isInteger(diaCorte) || diaCorte < 1 || diaCorte > 31) return null;
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const inicioPromo = diaDelMes(anio, mes, diaPromocional);
  const fin = new Date(inicioPromo);
  fin.setDate(fin.getDate() - 1);
  const finDeMes = new Date(anio, mes + 1, 0);
  const calculo = new Date(finDeMes);
  calculo.setDate(calculo.getDate() + diasEspera);
  return {
    nombre: new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(anio, mes, 1)),
    inicio: diaDelMes(anio, mes - 1, diaPromocional),
    fin,
    inicioPromo,
    finDeMes,
    calculo,
    corte: diaDelMes(anio, mes + 1, diaCorte),
  };
}

/** `25/09`. */
export const diaYMes = (fecha: Date): string =>
  `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`;
