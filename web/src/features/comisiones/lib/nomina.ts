/**
 * La nómina ordenada como se paga: un bloque por equipo de ventas y, dentro, los
 * roles de dirección (jefes, coordinadores y gerentes, la administradora, las
 * oficinas) y los supervisores con los asesores de cada uno.
 *
 * **Cada persona sale una vez por equipo** y con su pago entero (el tramo de un
 * asesor depende de todas sus ventas y no se reparte), así que la suma de los
 * equipos es exactamente el total a pagar. Quien tiene papel en dos equipos (el
 * gerente de operaciones) sale en cada uno con lo que cobra allí.
 *
 * Un asesor va con el supervisor con quien carga más ventas; si le carga otro,
 * se dice cuántas. Sin supervisor registrado, va a «Sin supervisor». Nada se
 * deduce de la oficina o del site de nadie.
 */

import { formatoMonto, formatoPct } from './formato';
import type {
  CondicionesComision, FilaEquipo, InformeComision, PagoComision, RolVentas, VentaComision,
} from '../types';
import type { TramoPago } from '@/shared/types/subscriptions';

// --- Las cifras de una persona ------------------------------------------------------

/** Las ventas válidas por las que cobra: propias, de equipo y PYME. */
export const ventasValidadas = (p: PagoComision): number => p.ventas_propias + p.ventas_equipo + p.ventas_pyme;

/**
 * De sus validadas, las que se pagan.
 *
 * Solo quien cobra por tramos (asesores, telemarketing) y el coordinador de UN
 * sin crecimiento conocido cobran menos ventas de las que validaron. Los demás
 * cobran todas: su cumplimiento recorta el monto, no las ventas. La PYME de un
 * plan sin % no se paga.
 */
export function ventasPagadas(p: PagoComision): number {
  const pyme = p.ventas_pyme - p.pyme_sin_porcentaje;
  if (p.detalle.ventas_pagadas !== undefined) return p.detalle.ventas_pagadas + pyme;
  if (p.rol === 'coord_un' && p.detalle.monto_por_venta_equipo === undefined) return p.ventas_propias + pyme;
  return p.ventas_propias + p.ventas_equipo + pyme;
}

/** El tramo en el que cae una cantidad de ventas: el último que empieza en o antes. */
export function tramoAsesor(ventas: number, tramos: TramoPago[]): TramoPago {
  let elegido = tramos[0];
  for (const tramo of tramos) if (tramo.desde <= ventas) elegido = tramo;
  return elegido;
}

/** El siguiente tramo que paga más por venta; nulo en el último. */
export const siguienteTramo = (ventas: number, tramos: TramoPago[]): TramoPago | null =>
  tramos.find((t) => t.desde > ventas) ?? null;

/** Desde cuántas ventas empieza a cobrar quien cobra por tramos. */
export const minimoQuePaga = (tramos: TramoPago[]): number | null =>
  tramos.find((t) => t.monto > 0)?.desde ?? null;

/** `6–19`, `20`, `26+`. */
export function rangoTramo(tramo: TramoPago, tramos: TramoPago[]): string {
  const siguiente = tramos[tramos.indexOf(tramo) + 1];
  if (!siguiente) return `${tramo.desde}+`;
  return siguiente.desde - 1 === tramo.desde ? String(tramo.desde) : `${tramo.desde}–${siguiente.desde - 1}`;
}

/**
 * Por qué cobra menos de lo que validó, o nada. Nulo si cobra todo.
 *
 * Es lo que acompaña a una fila atenuada: un $0 sin motivo se lee como un error.
 */
export function motivoRecorte(p: PagoComision, tramos: TramoPago[] | undefined): string | null {
  const sinPorcentaje = p.pyme_sin_porcentaje ? ` · ${p.pyme_sin_porcentaje} PYME sin % de comisión` : '';
  if (p.detalle.ventas_pagadas !== undefined) {
    const pagadas = p.detalle.ventas_pagadas;
    const minimo = tramos ? minimoQuePaga(tramos) : null;
    if (p.ventas_propias > 0 && !p.detalle.monto_por_venta) {
      return `${p.ventas_propias} ${p.ventas_propias === 1 ? 'venta' : 'ventas'}: no llega a ${minimo ?? 'el primer tramo'}${sinPorcentaje}`;
    }
    if (pagadas < p.ventas_propias) return `Su tramo descuenta ${p.ventas_propias - pagadas}${sinPorcentaje}`;
  }
  if (p.rol === 'coord_un' && p.detalle.monto_por_venta_equipo === undefined && p.ventas_equipo) {
    return `Crecimiento desconocido: las ${p.ventas_equipo} ventas de su equipo no se pagan${sinPorcentaje}`;
  }
  if (p.factor_pct !== null && p.factor_pct < 100) {
    return `Cobra el ${formatoPct(p.factor_pct)} de ${formatoMonto(p.bruto)}${sinPorcentaje}`;
  }
  return sinPorcentaje ? sinPorcentaje.slice(3) : null;
}

/** Los bonos de un pago, uno por línea: `Meta de 30 ventas: +$120,00`. Vacío si no cobra ninguno. */
export const notasBono = (p: PagoComision): string[] =>
  (p.detalle.bonos ?? []).map((b) => `${b.concepto}: +${formatoMonto(b.monto)}`);

/**
 * Las ventas válidas por las que cobra un pago: las que hizo él mismo y las de su
 * alcance de equipo (`equipo.alcance` de sus condiciones), sin las de oficina si
 * las excluye. Es lo mismo que decide `pagos.calcular_pagos` en el servidor.
 */
export function ventasDelPago(p: PagoComision, ventas: VentaComision[], condiciones: CondicionesComision): VentaComision[] {
  const alcance = condiciones.equipos?.[p.equipo]?.[p.rol]?.equipo;
  return ventas.filter((v) => {
    if (v.clasificacion !== 'valida' || v.equipo !== p.equipo) return false;
    if (v.medio_id === p.persona_id) return true;
    if (v.pyme || !alcance) return false;
    if (alcance.excluir_oficina && v.es_oficina) return false;
    switch (alcance.alcance) {
      case 'supervisados': return v.supervisor_id === p.persona_id;
      case 'oficina': return v.coord_oficina_id === p.persona_id;
      case 'unidades': return v.unidades.some((u) => p.unidades.includes(u));
      case 'equipo_completo': return true;
      default: return false;
    }
  });
}

// --- La jerarquía -------------------------------------------------------------------

/** La clave de un pago en la nómina: una persona puede cobrar en dos equipos. */
export const clavePago = (p: Pick<PagoComision, 'persona_id' | 'equipo'>): string => `${p.persona_id}:${p.equipo}`;

const SIN = 'sin';

/** Los asesores que cargan sus ventas con un mismo supervisor. */
export interface GrupoSupervisor {
  key: string;
  id: number | null;
  nombre: string;
  /** Su pago si es un supervisor del equipo; nulo si no lo es o la venta no lo trae. */
  pago: PagoComision | null;
  asesores: PagoComision[];
  usd: number;
}

/** Los pagos de un rol de dirección dentro de un equipo (jefe, coordinadores, gerentes, oficinas...). */
export interface SeccionRol {
  rol: RolVentas;
  etiqueta: string;
  pagos: PagoComision[];
  usd: number;
}

export interface EquipoNomina {
  slug: string;
  nombre: string;
  secciones: SeccionRol[];
  grupos: GrupoSupervisor[];
  /** Todos los que cobran en el equipo, cada uno una vez. */
  personas: PagoComision[];
  /** Las ventas válidas del equipo. */
  ventas: number;
  usd: number;
}

export interface Nomina {
  equipos: EquipoNomina[];
  /** Ventas válidas de cada persona que quedaron con otro supervisor (incluidas en su pago), por `clavePago`. */
  fuera: Map<string, { ventas: number; donde: string }>;
  /** El equipo donde quedó cada pago, para el buscador. */
  ubicacion: Map<string, string>;
}

const total = (personas: PagoComision[]) => Math.round(personas.reduce((t, p) => t + p.neto, 0) * 100) / 100;
const porNeto = (a: PagoComision, b: PagoComision) => b.neto - a.neto || a.nombre.localeCompare(b.nombre);
/** La clave con más ventas; a igualdad, la menor, para que el reparto no dependa del orden. */
const mayor = (m: Map<string, number> | undefined): string | null => {
  if (!m || m.size === 0) return null;
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
};

/** Los roles que se presentan como grupos de supervisor con sus asesores. */
const ROLES_EN_GRUPO: RolVentas[] = ['supervisor', 'asesor'];

/**
 * Arma la nómina de un informe a partir de `equipos`: quién vendió con quién.
 *
 * - Cada equipo, en el orden de `orden`, con sus roles en el orden del equipo.
 * - Supervisores y asesores van en grupos; el resto de roles, en secciones por rol.
 * - Cada asesor va con el supervisor con quien carga más ventas.
 */
export function armarNomina(
  informe: InformeComision,
  orden: { slug: string; nombre: string; roles: { rol: RolVentas; etiqueta: string }[] }[],
): Nomina {
  const filas: FilaEquipo[] = informe.equipos.filter((f) => f.ventas + f.pyme > 0);
  const persona = (id: number) => informe.personas[String(id)];

  const fuera = new Map<string, { ventas: number; donde: string }>();
  const ubicacion = new Map<string, string>();

  const equipos = orden.flatMap<EquipoNomina>((e) => {
    const pagos = informe.pagos.filter((p) => p.equipo === e.slug);
    if (pagos.length === 0) return [];
    const delEquipo = filas.filter((f) => f.equipo === e.slug);
    const porClave = new Map(pagos.map((p) => [p.persona_id, p]));

    // Con quién vende cada uno: quien vende → supervisor → ventas.
    const vendeCon = new Map<number, Map<string, number>>();
    for (const f of delEquipo) {
      if (f.medio_id === null) continue;
      const m = vendeCon.get(f.medio_id) ?? new Map<string, number>();
      const k = f.supervisor_id === null ? SIN : String(f.supervisor_id);
      m.set(k, (m.get(k) ?? 0) + f.ventas + f.pyme);
      vendeCon.set(f.medio_id, m);
    }

    const secciones: SeccionRol[] = e.roles
      .filter((r) => !ROLES_EN_GRUPO.includes(r.rol))
      .map((r) => {
        const delRol = pagos.filter((p) => p.rol === r.rol).sort(porNeto);
        return { rol: r.rol, etiqueta: r.etiqueta, pagos: delRol, usd: total(delRol) };
      })
      .filter((s) => s.pagos.length > 0);

    const grupos = new Map<string, GrupoSupervisor>();
    const grupo = (key: string): GrupoSupervisor => {
      let g = grupos.get(key);
      if (!g) {
        const id = key === SIN ? null : Number(key);
        const pago = id !== null && porClave.get(id)?.rol === 'supervisor' ? porClave.get(id) ?? null : null;
        g = { key, id, nombre: id === null ? 'Sin supervisor' : pago?.nombre ?? persona(id)?.nombre ?? '—', pago, asesores: [], usd: 0 };
        grupos.set(key, g);
      }
      return g;
    };

    for (const p of pagos) {
      ubicacion.set(clavePago(p), e.slug);
      if (p.rol === 'supervisor') {
        grupo(String(p.persona_id));
      } else if (p.rol === 'asesor') {
        const supKey = mayor(vendeCon.get(p.persona_id)) ?? SIN;
        // Un supervisor sin pago en este equipo (o una oficina) no encabeza grupo: «Sin supervisor».
        const key = supKey !== SIN && porClave.get(Number(supKey))?.rol === 'supervisor' ? supKey : SIN;
        grupo(key).asesores.push(p);
        const conOtros = [...(vendeCon.get(p.persona_id) ?? new Map<string, number>()).entries()]
          .reduce((t, [k, n]) => t + (k === supKey ? 0 : n), 0);
        if (conOtros) fuera.set(clavePago(p), { ventas: conOtros, donde: 'otro supervisor' });
      }
    }
    for (const g of grupos.values()) {
      g.asesores.sort(porNeto);
      g.usd = total([...(g.pago ? [g.pago] : []), ...g.asesores]);
    }
    const listaGrupos = [...grupos.values()].sort((a, b) =>
      Number(a.key === SIN) - Number(b.key === SIN) || b.usd - a.usd || a.nombre.localeCompare(b.nombre));

    const personas = [...secciones.flatMap((s) => s.pagos), ...listaGrupos.flatMap((g) => [...(g.pago ? [g.pago] : []), ...g.asesores])];
    return [{
      slug: e.slug,
      nombre: e.nombre,
      secciones,
      grupos: listaGrupos,
      personas,
      ventas: delEquipo.reduce((t, f) => t + f.ventas + f.pyme, 0),
      usd: total(personas),
    }];
  });

  return { equipos, fuera, ubicacion };
}
