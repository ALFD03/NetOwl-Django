/**
 * La nómina ordenada como se paga: las unidades de negocio, cada una con sus
 * supervisores y los asesores de cada supervisor, y las oficinas aparte.
 *
 * Las oficinas no son parte de ninguna unidad: cobran por las ventas que las
 * nombran como `Vendedor`, las cargue el supervisor que las cargue. Se dice con
 * qué unidades comparten ventas, pero nunca se meten dentro.
 *
 * **Lo que no tiene unidad va con su oficina**, con la misma forma que una
 * unidad: el supervisor sin coordinador de UN, con la oficina con que cargó
 * más ventas; el asesor sin supervisor, con la oficina de más ventas suyas.
 * Solo lo que tampoco tiene oficina queda aparte, en «Sin unidad ni oficina».
 *
 * **Cada persona sale una sola vez** y con su pago entero (el tramo de un
 * asesor depende de todas sus ventas y no se reparte), así que la suma de las
 * unidades y las oficinas es exactamente el total a pagar.
 */

import { formatoMonto, formatoPct } from './formato';
import type {
  CondicionesComision, FilaEquipo, InformeComision, PagoComision, TramoAsesor, TramoUn,
} from '../types';

// --- Las cifras de una persona ------------------------------------------------------

/** Las ventas válidas por las que cobra: propias, de equipo y PYME. */
export const ventasValidadas = (p: PagoComision): number => p.ventas_propias + p.ventas_equipo + p.ventas_pyme;

/**
 * De sus validadas, las que se pagan.
 *
 * Solo el asesor y el coordinador de UN sin crecimiento cobran menos ventas de
 * las que validaron. El supervisor y la oficina cobran todas: su cumplimiento
 * recorta el monto, no las ventas. La PYME de un plan sin % no se paga.
 */
export function ventasPagadas(p: PagoComision): number {
  const pyme = p.ventas_pyme - p.pyme_sin_porcentaje;
  if (p.cargo === 'asesor') return (p.detalle.ventas_pagadas ?? 0) + pyme;
  if (p.cargo === 'coord_un' && p.crecimiento_pct === null) return p.ventas_propias + pyme;
  return p.ventas_propias + p.ventas_equipo + pyme;
}

/** El tramo en el que cae una cantidad de ventas: el último que empieza en o antes. */
export function tramoAsesor(ventas: number, tramos: TramoAsesor[]): TramoAsesor {
  let elegido = tramos[0];
  for (const tramo of tramos) if (tramo.desde <= ventas) elegido = tramo;
  return elegido;
}

/** El siguiente tramo que paga más por venta; nulo en el último. */
export const siguienteTramo = (ventas: number, tramos: TramoAsesor[]): TramoAsesor | null =>
  tramos.find((t) => t.desde > ventas) ?? null;

/** Desde cuántas ventas empieza a cobrar un asesor. */
export const minimoQuePaga = (tramos: TramoAsesor[]): number | null =>
  tramos.find((t) => t.monto > 0)?.desde ?? null;

/** `6–19`, `20`, `26+`. */
export function rangoTramo(tramo: TramoAsesor, tramos: TramoAsesor[]): string {
  const siguiente = tramos[tramos.indexOf(tramo) + 1];
  if (!siguiente) return `${tramo.desde}+`;
  return siguiente.desde - 1 === tramo.desde ? String(tramo.desde) : `${tramo.desde}–${siguiente.desde - 1}`;
}

/** Los cortes de crecimiento a partir de los que cambia el monto por venta del coordinador de UN. */
export const cortesCrecimiento = (tramos: TramoUn[]): number[] =>
  tramos.map((t) => t.desde_pct).filter((d): d is number => d !== null);

/**
 * Por qué cobra menos de lo que validó, o nada. Nulo si cobra todo.
 *
 * Es lo que acompaña a una fila atenuada: un $0 sin motivo se lee como un error.
 */
export function motivoRecorte(p: PagoComision, condiciones: CondicionesComision): string | null {
  const sinPorcentaje = p.pyme_sin_porcentaje ? ` · ${p.pyme_sin_porcentaje} PYME sin % de comisión` : '';
  if (p.cargo === 'asesor') {
    const pagadas = p.detalle.ventas_pagadas ?? 0;
    const minimo = minimoQuePaga(condiciones.tramos_asesor);
    if (p.ventas_propias > 0 && !p.detalle.monto_por_venta) {
      return `${p.ventas_propias} ${p.ventas_propias === 1 ? 'venta' : 'ventas'}: no llega a ${minimo ?? 'el primer tramo'}${sinPorcentaje}`;
    }
    if (pagadas < p.ventas_propias) return `Su tramo descuenta ${p.ventas_propias - pagadas}${sinPorcentaje}`;
  }
  if (p.cargo === 'coord_un' && p.crecimiento_pct === null && p.ventas_equipo) {
    return `Crecimiento desconocido: las ${p.ventas_equipo} ventas de su equipo no se pagan${sinPorcentaje}`;
  }
  if ((p.cargo === 'supervisor' || p.cargo === 'coord_oficina') && p.factor_pct !== null && p.factor_pct < 100) {
    return `Cobra el ${formatoPct(p.factor_pct)} de ${formatoMonto(p.bruto)}${sinPorcentaje}`;
  }
  return sinPorcentaje ? sinPorcentaje.slice(3) : null;
}

// --- La jerarquía -------------------------------------------------------------------

const SIN = 'sin';
const clave = (id: number | null) => (id === null ? SIN : String(id));

/** Con quién comparte ventas una unidad o una oficina. */
export interface Relacion {
  id: number | null;
  nombre: string;
  ventas: number;
}

/** Los asesores que cargan sus ventas con un mismo supervisor, dentro de una unidad. */
export interface GrupoSupervisor {
  key: string;
  id: number | null;
  nombre: string;
  /**
   * Su pago si es un supervisor. Nulo si quien supervisa es el coordinador de
   * la unidad o una oficina (cobran en su sitio) o si la venta no lo trae.
   */
  pago: PagoComision | null;
  /** Quién supervisa cuando no es un supervisor: `coord_un`, `coord_oficina` o nadie. */
  supervisa: 'supervisor' | 'coord_un' | 'coord_oficina' | 'nadie';
  asesores: PagoComision[];
  usd: number;
}

export interface Unidad {
  key: string;
  id: number | null;
  nombre: string;
  /** Lo que cobra el coordinador de UN; nulo en «sin unidad» o si no cobra. */
  coordinador: PagoComision | null;
  grupos: GrupoSupervisor[];
  /** Todos los que cobran en ella, cada uno una vez. */
  personas: PagoComision[];
  /** Las ventas válidas que pasaron por la unidad. */
  ventas: number;
  oficinas: Relacion[];
  usd: number;
}

export interface Oficina {
  pago: PagoComision;
  unidades: Relacion[];
  /** Los supervisores sin unidad y los asesores sin supervisor que cargaron con ella. */
  grupos: GrupoSupervisor[];
  /** La oficina y su equipo sin unidad, cada uno una vez. */
  personas: PagoComision[];
  usd: number;
}

export interface Nomina {
  /** Las unidades de negocio; la última puede ser «Sin unidad ni oficina» (`id` nulo). */
  unidades: Unidad[];
  oficinas: Oficina[];
  /** Ventas válidas de cada persona que quedaron en otro equipo (incluidas en su pago). */
  fuera: Map<number, { ventas: number; donde: string }>;
  /** Dónde quedó cada persona, para el buscador: `u:<unidad>` u `o:<oficina>`. */
  ubicacion: Map<number, string>;
}

const sumar = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
const anidado = <K>(m: Map<K, Map<string, number>>, k: K) => {
  let interior = m.get(k);
  if (!interior) {
    interior = new Map();
    m.set(k, interior);
  }
  return interior;
};
/** La clave con más ventas; a igualdad, la menor, para que el reparto no dependa del orden. */
const mayor = (m: Map<string, number> | undefined): string | null => {
  if (!m || m.size === 0) return null;
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
};
const total = (personas: PagoComision[]) => Math.round(personas.reduce((t, p) => t + p.neto, 0) * 100) / 100;
const porNeto = (a: PagoComision, b: PagoComision) => b.neto - a.neto || a.nombre.localeCompare(b.nombre);

/**
 * Arma la nómina de un informe a partir de `equipos`: quién vendió con quién.
 *
 * - Cada coordinador de UN encabeza su unidad.
 * - Cada supervisor va a la unidad donde supervisa más ventas; sin unidad, a
 *   la oficina con que cargó más ventas.
 * - Cada asesor va con el supervisor con quien carga más ventas, y a donde vaya
 *   ese supervisor; si le carga otro, se dice cuántas. Sin supervisor, a la
 *   unidad o la oficina de más ventas suyas.
 * - Cada oficina va a su sección, con las unidades con que comparte ventas y
 *   el equipo sin unidad que cargó con ella.
 * - Lo que no tiene ni unidad ni oficina, aparte.
 */
export function armarNomina(informe: InformeComision): Nomina {
  const filas: FilaEquipo[] = (informe.equipos ?? []).filter((f) => f.ventas + f.pyme > 0);
  const pagos = new Map(informe.pagos.map((p) => [p.persona_id, p]));
  const nombre = (id: number | null) =>
    id === null ? '' : pagos.get(id)?.nombre || informe.personas?.[String(id)]?.nombre || '—';
  const cargo = (id: number | null) =>
    id === null ? null : pagos.get(id)?.cargo ?? (informe.personas?.[String(id)]?.cargo || null);

  const supervisaEn = new Map<number, Map<string, number>>(); // supervisor → unidad → ventas
  const vendeCon = new Map<number, Map<string, number>>(); // quien vende → supervisor → ventas
  const vendeEn = new Map<string, Map<string, number>>(); // "medio|supervisor" → unidad → ventas
  const apareceEn = new Map<number, Map<string, number>>(); // cualquiera → unidad → ventas
  const ventasUnidad = new Map<string, number>();
  const unidadOficina = new Map<string, Map<string, number>>();
  const oficinaUnidad = new Map<number, Map<string, number>>();
  const supervisaCon = new Map<number, Map<string, number>>(); // supervisor → oficina → ventas
  const vendeConOficina = new Map<string, Map<string, number>>(); // "medio|supervisor" → oficina → ventas

  let ventasSinNada = 0; // ni unidad ni oficina: lo único que queda aparte
  for (const f of filas) {
    const n = f.ventas + f.pyme;
    const u = clave(f.coord_un_id);
    sumar(ventasUnidad, u, n);
    if (f.coord_un_id === null && f.coord_oficina_id === null) ventasSinNada += n;
    if (f.supervisor_id !== null) sumar(anidado(supervisaEn, f.supervisor_id), u, n);
    if (f.medio_id !== null) {
      sumar(anidado(vendeCon, f.medio_id), clave(f.supervisor_id), n);
      sumar(anidado(vendeEn, `${f.medio_id}|${clave(f.supervisor_id)}`), u, n);
    }
    for (const id of new Set([f.coord_un_id, f.coord_oficina_id, f.supervisor_id, f.medio_id])) {
      if (id !== null) sumar(anidado(apareceEn, id), u, n);
    }
    sumar(anidado(unidadOficina, u), clave(f.coord_oficina_id), n);
    if (f.coord_oficina_id !== null) {
      sumar(anidado(oficinaUnidad, f.coord_oficina_id), u, n);
      if (f.supervisor_id !== null) sumar(anidado(supervisaCon, f.supervisor_id), String(f.coord_oficina_id), n);
      if (f.medio_id !== null) sumar(anidado(vendeConOficina, `${f.medio_id}|${clave(f.supervisor_id)}`), String(f.coord_oficina_id), n);
    }
  }

  /** La unidad de quien supervisa: la suya si es coordinador de UN, la de más ventas si es supervisor. */
  const unidadDeSupervisor = (id: number): string | null => {
    const c = cargo(id);
    if (c === 'coord_un') return String(id);
    if (c === 'supervisor') return mayor(supervisaEn.get(id)) ?? mayor(apareceEn.get(id));
    return null;
  };

  // Las oficinas primero: lo que no tiene unidad se reparte entre ellas.
  const oficinasPorId = new Map<number, Oficina>();
  for (const p of informe.pagos) {
    if (p.cargo !== 'coord_oficina') continue;
    oficinasPorId.set(p.persona_id, {
      pago: p,
      unidades: [...(oficinaUnidad.get(p.persona_id) ?? new Map<string, number>()).entries()]
        .map(([k, ventas]) => ({ id: k === SIN ? null : Number(k), nombre: k === SIN ? 'Sin unidad de negocio' : nombre(Number(k)), ventas }))
        .sort((a, b) => b.ventas - a.ventas),
      grupos: [],
      personas: [],
      usd: 0,
    });
  }
  /** La oficina de más ventas entre las que cobran; nula si no hay ninguna. */
  const oficinaDe = (m: Map<string, number> | undefined): Oficina | null => {
    const deOficinas = new Map([...(m ?? new Map<string, number>())].filter(([k]) => oficinasPorId.has(Number(k))));
    const k = mayor(deOficinas);
    return k === null ? null : oficinasPorId.get(Number(k)) ?? null;
  };

  /** Dónde va un supervisor: su unidad, o sin ella la oficina con que más cargó. */
  type Lugar = { unidad: string } | { oficina: Oficina };
  const lugarSupervisor = (id: number): Lugar => {
    const key = unidadDeSupervisor(id);
    if (key !== null && key !== SIN) return { unidad: key };
    const oficina = oficinaDe(supervisaCon.get(id));
    return oficina ? { oficina } : { unidad: SIN };
  };

  const unidades = new Map<string, Unidad>();
  const unidad = (key: string): Unidad => {
    let u = unidades.get(key);
    if (!u) {
      const id = key === SIN ? null : Number(key);
      u = {
        key, id, nombre: id === null ? 'Sin unidad ni oficina' : nombre(id),
        coordinador: null, grupos: [], personas: [], ventas: id === null ? ventasSinNada : ventasUnidad.get(key) ?? 0, oficinas: [], usd: 0,
      };
      unidades.set(key, u);
    }
    return u;
  };
  const grupo = (u: { grupos: GrupoSupervisor[] }, supKey: string): GrupoSupervisor => {
    let g = u.grupos.find((x) => x.key === supKey);
    if (!g) {
      const id = supKey === SIN ? null : Number(supKey);
      const c = cargo(id);
      const pago = id !== null && c === 'supervisor' ? pagos.get(id) ?? null : null;
      g = {
        key: supKey, id, nombre: id === null ? 'Sin supervisor' : nombre(id), pago,
        supervisa: id === null ? 'nadie' : c === 'coord_un' ? 'coord_un' : c === 'coord_oficina' ? 'coord_oficina' : 'supervisor',
        asesores: [], usd: 0,
      };
      u.grupos.push(g);
    }
    return g;
  };

  const fuera = new Map<number, { ventas: number; donde: string }>();
  const ubicacion = new Map<number, string>();
  /** Las ventas de `m` fuera de la clave elegida: las que cargó en otro equipo. */
  const resto = (m: Map<string, number> | undefined, elegida: string) =>
    [...(m ?? new Map<string, number>()).entries()].reduce((t, [k, n]) => t + (k === elegida ? 0 : n), 0);

  for (const p of informe.pagos) {
    const id = p.persona_id;
    if (p.cargo === 'coord_oficina') {
      ubicacion.set(id, `o:${id}`);
      continue;
    }
    if (p.cargo === 'coord_un') {
      const u = unidad(String(id));
      u.coordinador = p;
      ubicacion.set(id, `u:${u.key}`);
      continue;
    }
    if (p.cargo === 'supervisor') {
      const lugar = lugarSupervisor(id);
      if ('oficina' in lugar) {
        const oficinaId = lugar.oficina.pago.persona_id;
        grupo(lugar.oficina, String(id));
        ubicacion.set(id, `o:${oficinaId}`);
        const otras = resto(supervisaCon.get(id), String(oficinaId));
        if (otras) fuera.set(id, { ventas: otras, donde: 'otra oficina' });
      } else {
        grupo(unidad(lugar.unidad), String(id));
        ubicacion.set(id, `u:${lugar.unidad}`);
        const otras = resto(supervisaEn.get(id), lugar.unidad);
        if (otras) fuera.set(id, { ventas: otras, donde: 'otra unidad' });
      }
      continue;
    }
    // Asesor: con el supervisor con quien más vende, y a donde vaya ese supervisor.
    const supKey = mayor(vendeCon.get(id)) ?? SIN;
    const supId = supKey === SIN ? null : Number(supKey);
    const supCargo = cargo(supId);
    let lugar: Lugar;
    if (supId !== null && supCargo === 'supervisor') {
      lugar = lugarSupervisor(supId);
    } else if (supId !== null && supCargo === 'coord_oficina' && oficinasPorId.has(supId)) {
      lugar = { oficina: oficinasPorId.get(supId)! };
    } else {
      const key = (supId !== null ? unidadDeSupervisor(supId) : null)
        ?? mayor(vendeEn.get(`${id}|${supKey}`))
        ?? mayor(apareceEn.get(id))
        ?? SIN;
      const oficina = key === SIN ? oficinaDe(vendeConOficina.get(`${id}|${supKey}`)) : null;
      lugar = oficina ? { oficina } : { unidad: key };
    }
    if ('oficina' in lugar) {
      grupo(lugar.oficina, supKey).asesores.push(p);
      ubicacion.set(id, `o:${lugar.oficina.pago.persona_id}`);
    } else {
      grupo(unidad(lugar.unidad), supKey).asesores.push(p);
      ubicacion.set(id, `u:${lugar.unidad}`);
    }
    const conOtros = resto(vendeCon.get(id), supKey);
    if (conOtros) fuera.set(id, { ventas: conOtros, donde: 'otro supervisor' });
  }

  /** Ordena los grupos y suma lo que cobra cada uno; `propio` es la clave de quien encabeza. */
  const cerrarGrupos = (grupos: GrupoSupervisor[], propio: string) => {
    for (const g of grupos) {
      g.asesores.sort(porNeto);
      g.usd = total([...(g.pago ? [g.pago] : []), ...g.asesores]);
    }
    // Primero lo que supervisa quien encabeza, luego por lo que cobra el
    // equipo, y lo que no tiene supervisor al final.
    grupos.sort((a, b) =>
      Number(a.key === SIN) - Number(b.key === SIN)
      || Number(b.key === propio) - Number(a.key === propio)
      || b.usd - a.usd
      || a.nombre.localeCompare(b.nombre));
    return grupos.flatMap((g) => [...(g.pago ? [g.pago] : []), ...g.asesores]);
  };

  for (const o of oficinasPorId.values()) {
    o.personas = [o.pago, ...cerrarGrupos(o.grupos, String(o.pago.persona_id))];
    o.usd = total(o.personas);
  }

  for (const u of unidades.values()) {
    u.personas = [...(u.coordinador ? [u.coordinador] : []), ...cerrarGrupos(u.grupos, u.key)];
    u.usd = total(u.personas);
    if (u.key === SIN) continue;
    u.oficinas = [...(unidadOficina.get(u.key) ?? new Map<string, number>()).entries()]
      .filter(([k]) => k !== SIN)
      .map(([k, ventas]) => ({ id: Number(k), nombre: nombre(Number(k)), ventas }))
      .sort((a, b) => b.ventas - a.ventas);
  }

  return {
    unidades: [...unidades.values()].sort((a, b) => Number(a.id === null) - Number(b.id === null) || b.usd - a.usd),
    oficinas: [...oficinasPorId.values()].sort((a, b) => b.usd - a.usd || a.pago.nombre.localeCompare(b.pago.nombre)),
    fuera,
    ubicacion,
  };
}
