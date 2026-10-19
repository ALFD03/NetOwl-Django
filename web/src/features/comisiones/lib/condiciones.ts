/**
 * Lo que la página de condiciones calcula para explicar las reglas mientras se
 * leen o se editan.
 *
 * Replica `reglas.pago_asesor`, `reglas.monto_un` y las comprobaciones de
 * `reglas.validar_tramos_*` y de `api_condiciones_guardar` solo para enseñar su
 * efecto antes de guardar: la cifra que cuenta es la del servidor, que vuelve a
 * validarlo todo al recibirlo.
 */

import { formatoMonto } from './formato';
import { tramoAsesor } from './nomina';
import type { CondicionesComision, TramoAsesor, TramoUn } from '../types';

const PCT = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 });

/** `1%`, `1,5%`: los cortes de crecimiento, sin ceros de relleno. */
export const pctCorto = (valor: number): string => `${PCT.format(valor)}%`;

/** Un monto, o una raya si la casilla está vacía. */
const montoOVacio = (valor: number): string => (Number.isFinite(valor) ? formatoMonto(valor) : '—');

// --- Asesores -----------------------------------------------------------------------

export const ordenarTramosAsesor = (tramos: TramoAsesor[]): TramoAsesor[] =>
  [...tramos].sort((a, b) => a.desde - b.desde);

export interface PagoAsesor {
  tramo: TramoAsesor | null;
  pagadas: number;
  monto: number;
}

/** Lo que cobra un asesor con `ventas` residenciales: `reglas.pago_asesor`. */
export function pagoAsesor(ventas: number, tramos: TramoAsesor[]): PagoAsesor {
  const ordenados = ordenarTramosAsesor(tramos);
  if (!ordenados.length) return { tramo: null, pagadas: 0, monto: 0 };
  const tramo = tramoAsesor(ventas, ordenados);
  const pagadas = Math.max(0, ventas - tramo.descontar);
  return { tramo, pagadas, monto: Math.round(pagadas * tramo.monto * 100) / 100 };
}

/** `6 a 19`, `20`, `26 o más`: hasta dónde llega un tramo, que es donde empieza el siguiente. */
export function rangoVentas(tramo: TramoAsesor, ordenados: TramoAsesor[]): string {
  const siguiente = ordenados[ordenados.indexOf(tramo) + 1];
  if (!siguiente) return `${tramo.desde} o más`;
  const hasta = siguiente.desde - 1;
  return hasta === tramo.desde ? String(tramo.desde) : `${tramo.desde} a ${hasta}`;
}

/** Un tramo del asesor como se lee: su rango, su fórmula y lo que paga. */
export interface TramoLeido {
  tramo: TramoAsesor;
  rango: string;
  formula: string;
  nota: string | null;
  cobra: string;
  /**
   * Lo que vale la venta que hace entrar en el tramo, cuando vale más que una
   * venta normal del tramo: es el salto que la tabla sola no deja ver.
   */
  salto: number | null;
}

export function leerTramosAsesor(tramos: TramoAsesor[]): TramoLeido[] {
  const ordenados = ordenarTramosAsesor(tramos);
  return ordenados.map((tramo, i) => {
    const siguiente = ordenados[i + 1];
    const alEntrar = pagoAsesor(tramo.desde, ordenados).monto;
    const alSalir = siguiente ? pagoAsesor(siguiente.desde - 1, ordenados).monto : null;
    const antes = tramo.desde > 0 ? pagoAsesor(tramo.desde - 1, ordenados).monto : null;
    const salto = antes === null ? null : Math.round((alEntrar - antes) * 100) / 100;

    let cobra: string;
    if (tramo.monto === 0) cobra = formatoMonto(0);
    else if (alSalir === null) cobra = `desde ${formatoMonto(alEntrar)}`;
    else if (alSalir === alEntrar) cobra = formatoMonto(alEntrar);
    else cobra = `${formatoMonto(alEntrar)} → ${formatoMonto(alSalir)}`;

    let formula: string;
    if (tramo.monto === 0) formula = 'No cobra';
    else if (tramo.descontar) formula = `(ventas − ${tramo.descontar}) × ${formatoMonto(tramo.monto)}`;
    else formula = `todas × ${formatoMonto(tramo.monto)}`;

    return {
      tramo,
      rango: rangoVentas(tramo, ordenados),
      formula,
      nota: tramo.monto > 0 && tramo.descontar ? `${tramo.descontar} de sus ventas no se pagan` : null,
      cobra,
      salto: i > 0 && tramo.monto > 0 && salto !== null && salto > tramo.monto ? salto : null,
    };
  });
}

/**
 * Las cantidades de ventas en las que se ve qué cambia al editar los tramos: el
 * último antes de cada inicio y el propio inicio, de la tabla vieja y de la nueva.
 */
export function ventasDeMuestra(antes: TramoAsesor[], despues: TramoAsesor[]): number[] {
  const inicios = [...antes, ...despues].map((t) => t.desde).filter((d) => Number.isFinite(d) && d > 0);
  const ultimo = Math.max(0, ...inicios);
  const muestra = new Set([...inicios.flatMap((d) => [d - 1, d]), ultimo + 4]);
  return [...muestra].filter((n) => n > 0).sort((a, b) => a - b);
}

// --- Coordinador de unidad de negocio ------------------------------------------------

/** El tramo "desde siempre" primero y los demás por su inicio, como los deja el servidor. */
export function ordenarTramosUn(tramos: TramoUn[]): TramoUn[] {
  const sinInicio = tramos.filter((t) => t.desde_pct === null);
  const conInicio = tramos
    .filter((t): t is TramoUn & { desde_pct: number } => t.desde_pct !== null)
    .sort((a, b) => a.desde_pct - b.desde_pct);
  return [...sinInicio, ...conInicio];
}

/** Lo que cobra por venta de equipo con ese crecimiento (%): `reglas.monto_un`. */
export function montoUn(crecimiento: number, tramos: TramoUn[]): number {
  const ordenados = ordenarTramosUn(tramos);
  let monto = ordenados[0]?.monto ?? 0;
  for (const tramo of ordenados) if (tramo.desde_pct !== null && tramo.desde_pct <= crecimiento) monto = tramo.monto;
  return monto;
}

/** `Menos de 1%`, `De 1% a menos de 2%`, `2% o más`. */
export function rangoCrecimiento(tramo: TramoUn, ordenados: TramoUn[]): string {
  const siguiente = ordenados[ordenados.indexOf(tramo) + 1];
  const hasta = siguiente?.desde_pct ?? null;
  if (tramo.desde_pct === null) return hasta === null ? 'Cualquier crecimiento' : `Menos de ${pctCorto(hasta)}`;
  if (hasta === null) return `${pctCorto(tramo.desde_pct)} o más`;
  return `De ${pctCorto(tramo.desde_pct)} a menos de ${pctCorto(hasta)}`;
}

/** Crecimientos de ejemplo a un lado y otro de cada corte, para el simulador. */
export function crecimientosDeMuestra(tramos: TramoUn[]): number[] {
  const cortes = ordenarTramosUn(tramos)
    .map((t) => t.desde_pct)
    .filter((d): d is number => d !== null);
  if (!cortes.length) return [0];
  const muestra = new Set([cortes[0] - 1, ...cortes.flatMap((c) => [c - 0.5, c]), cortes[cortes.length - 1] + 1]);
  return [...muestra].sort((a, b) => a - b);
}

// --- Validación ----------------------------------------------------------------------

/** Los errores de una tabla de tramos: los de cada fila (por su posición) y el de la tabla. */
export interface ErroresTramos {
  filas: Map<number, string>;
  general: string | null;
}

/** Lo que `validar_tramos_asesor` rechazaría, dicho en la fila que lo causa. */
export function erroresTramosAsesor(tramos: TramoAsesor[]): ErroresTramos {
  const filas = new Map<number, string>();
  if (!tramos.length) return { filas, general: 'Los tramos del asesor no pueden quedar vacíos.' };
  const vistos = new Set<number>();
  tramos.forEach((t, i) => {
    if (![t.desde, t.monto, t.descontar].every(Number.isFinite)) filas.set(i, 'Hace falta un número en cada casilla.');
    else if (t.desde < 0 || t.monto < 0 || t.descontar < 0) filas.set(i, 'No admite valores negativos.');
    else if (!Number.isInteger(t.desde) || !Number.isInteger(t.descontar)) filas.set(i, 'Las ventas se cuentan enteras.');
    else if (t.descontar > t.desde) filas.set(i, `Un tramo que empieza en ${t.desde} ventas no puede dejar ${t.descontar} sin pagar.`);
    else if (vistos.has(t.desde)) filas.set(i, `Ya hay un tramo que empieza en ${t.desde} ventas.`);
    vistos.add(t.desde);
  });
  const inicios = tramos.map((t) => t.desde).filter(Number.isFinite);
  const general = inicios.length && Math.min(...inicios) !== 0 ? 'El primer tramo tiene que empezar en 0 ventas.' : null;
  return { filas, general };
}

/** Lo que `validar_tramos_un` rechazaría. El primer tramo sin inicio es el «desde siempre». */
export function erroresTramosUn(tramos: TramoUn[]): ErroresTramos {
  const filas = new Map<number, string>();
  if (!tramos.length) return { filas, general: 'Los tramos de crecimiento no pueden quedar vacíos.' };
  const siempre = tramos.findIndex((t) => t.desde_pct === null);
  const vistos = new Set<number>();
  tramos.forEach((t, i) => {
    if (!Number.isFinite(t.monto)) filas.set(i, 'Hace falta el monto por venta.');
    else if (t.monto < 0) filas.set(i, 'El monto no puede ser negativo.');
    else if (t.desde_pct === null && i !== siempre) filas.set(i, 'Falta el % desde el que empieza.');
    else if (t.desde_pct !== null && vistos.has(t.desde_pct)) filas.set(i, `Ya hay un tramo que empieza en ${pctCorto(t.desde_pct)}.`);
    if (t.desde_pct !== null) vistos.add(t.desde_pct);
  });
  return { filas, general: siempre === -1 ? 'Un tramo tiene que valer para cualquier crecimiento.' : null };
}

export type CampoSimple = 'monto_equipo' | 'monto_directa' | 'monto_directa_un' | 'dia_promocional' | 'dias_espera';

/** Lo que `api_condiciones_guardar` rechazaría de los campos sueltos. */
export function erroresCampos(c: CondicionesComision): Partial<Record<CampoSimple, string>> {
  const errores: Partial<Record<CampoSimple, string>> = {};
  for (const campo of ['monto_equipo', 'monto_directa', 'monto_directa_un'] as const) {
    if (!Number.isFinite(c[campo])) errores[campo] = 'Hace falta un monto.';
    else if (c[campo] < 0) errores[campo] = 'No puede ser negativo.';
  }
  if (!Number.isInteger(c.dia_promocional) || c.dia_promocional < 1 || c.dia_promocional > 31) {
    errores.dia_promocional = 'Un día del mes, de 1 a 31.';
  }
  if (!Number.isInteger(c.dias_espera) || c.dias_espera < 0 || c.dias_espera > 60) {
    errores.dias_espera = 'De 0 a 60 días.';
  }
  return errores;
}

export interface ValidacionCondiciones {
  asesor: ErroresTramos;
  un: ErroresTramos;
  campos: Partial<Record<CampoSimple, string>>;
  total: number;
}

export function validarCondiciones(c: CondicionesComision): ValidacionCondiciones {
  const asesor = erroresTramosAsesor(c.tramos_asesor);
  const un = erroresTramosUn(c.tramos_un);
  const campos = erroresCampos(c);
  const total = asesor.filas.size + (asesor.general ? 1 : 0) + un.filas.size + (un.general ? 1 : 0)
    + Object.keys(campos).length;
  return { asesor, un, campos, total };
}

// --- Cambios sin guardar -------------------------------------------------------------

/** Un cambio respecto a lo guardado. `antes` nulo es algo nuevo; `despues` nulo, algo quitado. */
export interface Cambio {
  donde: string;
  antes: string | null;
  despues: string | null;
}

const CAMPOS: Record<CampoSimple, { donde: string; valor: (v: number) => string }> = {
  monto_equipo: { donde: 'Supervisores y oficina · venta de su equipo', valor: montoOVacio },
  monto_directa: { donde: 'Supervisores y oficina · venta propia', valor: montoOVacio },
  monto_directa_un: { donde: 'Coordinador de UN · venta propia', valor: montoOVacio },
  dia_promocional: { donde: 'Periodo · inicio de los días promocionales', valor: (v) => (Number.isFinite(v) ? `día ${v}` : '—') },
  dias_espera: { donde: 'Periodo · días de espera', valor: (v) => (Number.isFinite(v) ? `${v} días` : '—') },
};

/**
 * Los tramos se comparan por su inicio, que es lo que los identifica para quien
 * los lee: cambiar dónde empieza uno es quitar ese tramo y crear otro.
 */
function porInicio<T>(tramos: T[], inicio: (t: T) => number | null): Map<number | null, T> {
  const mapa = new Map<number | null, T>();
  for (const t of tramos) {
    const clave = inicio(t);
    if ((clave === null || Number.isFinite(clave)) && !mapa.has(clave)) mapa.set(clave, t);
  }
  return mapa;
}

function cambiosAsesor(antes: TramoAsesor[], despues: TramoAsesor[]): Cambio[] {
  const previos = porInicio(antes, (t) => t.desde);
  const nuevos = porInicio(despues, (t) => t.desde);
  const cambios: Cambio[] = [];
  for (const [desde, t] of nuevos) {
    const donde = `Asesores · tramo desde ${desde} ventas`;
    const p = previos.get(desde);
    if (!p) {
      cambios.push({ donde, antes: null, despues: `${montoOVacio(t.monto)} por venta` });
      continue;
    }
    if (t.monto !== p.monto) cambios.push({ donde: `${donde} · monto por venta`, antes: formatoMonto(p.monto), despues: montoOVacio(t.monto) });
    if (t.descontar !== p.descontar) {
      cambios.push({
        donde: `${donde} · ventas no pagadas`,
        antes: String(p.descontar),
        despues: Number.isFinite(t.descontar) ? String(t.descontar) : '—',
      });
    }
  }
  for (const [desde, p] of previos) {
    if (!nuevos.has(desde)) cambios.push({ donde: `Asesores · tramo desde ${desde} ventas`, antes: `${formatoMonto(p.monto)} por venta`, despues: null });
  }
  return cambios;
}

function cambiosUn(antes: TramoUn[], despues: TramoUn[]): Cambio[] {
  const nombre = (desde: number | null) =>
    `Coordinador de UN · tramo ${desde === null ? 'de cualquier crecimiento' : `desde ${pctCorto(desde)}`}`;
  const previos = porInicio(antes, (t) => t.desde_pct);
  const nuevos = porInicio(despues, (t) => t.desde_pct);
  const cambios: Cambio[] = [];
  for (const [desde, t] of nuevos) {
    const p = previos.get(desde);
    if (!p) cambios.push({ donde: nombre(desde), antes: null, despues: `${montoOVacio(t.monto)} por venta` });
    else if (t.monto !== p.monto) cambios.push({ donde: nombre(desde), antes: formatoMonto(p.monto), despues: montoOVacio(t.monto) });
  }
  for (const [desde, p] of previos) {
    if (!nuevos.has(desde)) cambios.push({ donde: nombre(desde), antes: `${formatoMonto(p.monto)} por venta`, despues: null });
  }
  return cambios;
}

export function cambiosPendientes(guardadas: CondicionesComision, borrador: CondicionesComision): Cambio[] {
  const cambios = cambiosAsesor(guardadas.tramos_asesor, borrador.tramos_asesor);
  for (const campo of ['monto_equipo', 'monto_directa'] as const) {
    if (borrador[campo] !== guardadas[campo]) {
      cambios.push({ donde: CAMPOS[campo].donde, antes: CAMPOS[campo].valor(guardadas[campo]), despues: CAMPOS[campo].valor(borrador[campo]) });
    }
  }
  cambios.push(...cambiosUn(guardadas.tramos_un, borrador.tramos_un));
  for (const campo of ['monto_directa_un', 'dia_promocional', 'dias_espera'] as const) {
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
  fin: Date;
  finDeMes: Date;
  calculo: Date;
}

/**
 * Las fechas del periodo del mes de `hoy` si sus días promocionales y los del
 * mes anterior empiezan el día habitual. Es solo un ejemplo: cada periodo
 * confirma su propio inicio al crearlo. Nulo si los campos no son válidos.
 */
export function periodoEjemplo(diaPromocional: number, diasEspera: number, hoy = new Date()): PeriodoEjemplo | null {
  if (!Number.isInteger(diaPromocional) || diaPromocional < 1 || diaPromocional > 31) return null;
  if (!Number.isInteger(diasEspera) || diasEspera < 0) return null;
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const fin = diaDelMes(anio, mes, diaPromocional);
  fin.setDate(fin.getDate() - 1);
  const finDeMes = new Date(anio, mes + 1, 0);
  const calculo = new Date(finDeMes);
  calculo.setDate(calculo.getDate() + diasEspera);
  return {
    nombre: new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(anio, mes, 1)),
    inicio: diaDelMes(anio, mes - 1, diaPromocional),
    fin,
    finDeMes,
    calculo,
  };
}

/** `25/09`. */
export const diaYMes = (fecha: Date): string =>
  `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`;
