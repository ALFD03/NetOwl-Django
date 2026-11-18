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

import { formatAmount, formatPctValue } from './format';
import type {
  CommissionConditions, TeamRow, CommissionReport, CommissionPayment, SalesRole, CommissionSale,
} from '../types';
import type { PaymentTier } from '@/shared/types/subscriptions';

// --- Las cifras de una persona ------------------------------------------------------

/** Las ventas válidas por las que cobra: propias, de equipo y PYME. */
export const validatedSales = (p: CommissionPayment): number => p.ventas_propias + p.ventas_equipo + p.ventas_pyme;

/**
 * De sus validadas, las que se pagan.
 *
 * Solo quien cobra por tramos (asesores, telemarketing) y el coordinador de UN
 * sin crecimiento conocido cobran menos ventas de las que validaron. Los demás
 * cobran todas: su cumplimiento recorta el monto, no las ventas. La PYME de un
 * plan sin % no se paga.
 */
export function paidSales(p: CommissionPayment): number {
  const pyme = p.ventas_pyme - p.pyme_sin_porcentaje;
  if (p.detalle.ventas_pagadas !== undefined) return p.detalle.ventas_pagadas + pyme;
  if (p.rol === 'coord_un' && p.detalle.monto_por_venta_equipo === undefined) return p.ventas_propias + pyme;
  return p.ventas_propias + p.ventas_equipo + pyme;
}

/** El tramo en el que cae una cantidad de ventas: el último que empieza en o antes. */
export function advisorTier(ventas: number, tramos: PaymentTier[]): PaymentTier {
  let elegido = tramos[0];
  for (const tramo of tramos) if (tramo.desde <= ventas) elegido = tramo;
  return elegido;
}

/** El siguiente tramo que paga más por venta; nulo en el último. */
export const nextTier = (ventas: number, tramos: PaymentTier[]): PaymentTier | null =>
  tramos.find((t) => t.desde > ventas) ?? null;

/** Desde cuántas ventas empieza a cobrar quien cobra por tramos. */
export const minimoQuePaga = (tramos: PaymentTier[]): number | null =>
  tramos.find((t) => t.monto > 0)?.desde ?? null;

/** `6–19`, `20`, `26+`. */
export function tierRange(tramo: PaymentTier, tramos: PaymentTier[]): string {
  const next = tramos[tramos.indexOf(tramo) + 1];
  if (!next) return `${tramo.desde}+`;
  return next.desde - 1 === tramo.desde ? String(tramo.desde) : `${tramo.desde}–${next.desde - 1}`;
}

/**
 * Por qué cobra menos de lo que validó, o nada. Nulo si cobra todo.
 *
 * Es lo que acompaña a una fila atenuada: un $0 sin motivo se lee como un error.
 */
export function trimReason(p: CommissionPayment, tramos: PaymentTier[] | undefined): string | null {
  const withoutPercentage = p.pyme_sin_porcentaje ? ` · ${p.pyme_sin_porcentaje} PYME sin % de comisión` : '';
  if (p.detalle.ventas_pagadas !== undefined) {
    const pagadas = p.detalle.ventas_pagadas;
    const minimo = tramos ? minimoQuePaga(tramos) : null;
    if (p.ventas_propias > 0 && !p.detalle.monto_por_venta) {
      return `${p.ventas_propias} ${p.ventas_propias === 1 ? 'venta' : 'ventas'}: no llega a ${minimo ?? 'el primer tramo'}${withoutPercentage}`;
    }
    if (pagadas < p.ventas_propias) return `Su tramo descuenta ${p.ventas_propias - pagadas}${withoutPercentage}`;
  }
  if (p.rol === 'coord_un' && p.detalle.monto_por_venta_equipo === undefined && p.ventas_equipo) {
    return `Crecimiento desconocido: las ${p.ventas_equipo} ventas de su equipo no se pagan${withoutPercentage}`;
  }
  if (p.factor_pct !== null && p.factor_pct < 100) {
    return `Cobra el ${formatPctValue(p.factor_pct)} de ${formatAmount(p.bruto)}${withoutPercentage}`;
  }
  return withoutPercentage ? withoutPercentage.slice(3) : null;
}

/** Los bonos de un pago, uno por línea: `Meta de 30 ventas: +$120,00`. Vacío si no cobra ninguno. */
export const bonusNotes = (p: CommissionPayment): string[] =>
  (p.detalle.bonos ?? []).map((b) => `${b.concepto}: +${formatAmount(b.monto)}`);

/**
 * Las ventas válidas por las que cobra un pago: las que hizo él mismo y las de su
 * alcance de equipo (`equipo.alcance` de sus condiciones), sin las de oficina si
 * las excluye. Es lo mismo que decide `pagos.calcular_pagos` en el servidor.
 */
export function paymentSales(p: CommissionPayment, ventas: CommissionSale[], condiciones: CommissionConditions): CommissionSale[] {
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
export const paymentKey = (p: Pick<CommissionPayment, 'persona_id' | 'equipo'>): string => `${p.persona_id}:${p.equipo}`;

const NONE = 'sin';

/** Los asesores que cargan sus ventas con un mismo supervisor. */
export interface SupervisorGroup {
  key: string;
  id: number | null;
  nombre: string;
  /** Su pago si es un supervisor del equipo; nulo si no lo es o la venta no lo trae. */
  pago: CommissionPayment | null;
  asesores: CommissionPayment[];
  usd: number;
}

/** Los pagos de un rol de dirección dentro de un equipo (jefe, coordinadores, gerentes, oficinas...). */
export interface SeccionRol {
  rol: SalesRole;
  etiqueta: string;
  pagos: CommissionPayment[];
  usd: number;
}

export interface PayrollTeam {
  slug: string;
  nombre: string;
  secciones: SeccionRol[];
  grupos: SupervisorGroup[];
  /** Todos los que cobran en el equipo, cada uno una vez. */
  personas: CommissionPayment[];
  /** Las ventas válidas del equipo. */
  ventas: number;
  usd: number;
}

export interface Payroll {
  equipos: PayrollTeam[];
  /** Ventas válidas de cada persona que quedaron con otro supervisor (incluidas en su pago), por `paymentKey`. */
  fuera: Map<string, { ventas: number; donde: string }>;
  /** El equipo donde quedó cada pago, para el buscador. */
  ubicacion: Map<string, string>;
}

const total = (personas: CommissionPayment[]) => Math.round(personas.reduce((t, p) => t + p.neto, 0) * 100) / 100;
const byNet = (a: CommissionPayment, b: CommissionPayment) => b.neto - a.neto || a.nombre.localeCompare(b.nombre);
/** La clave con más ventas; a igualdad, la menor, para que el reparto no dependa del orden. */
const mayor = (m: Map<string, number> | undefined): string | null => {
  if (!m || m.size === 0) return null;
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
};

/** Los roles que se presentan como grupos de supervisor con sus asesores. */
const ROLES_IN_GROUP: SalesRole[] = ['supervisor', 'asesor'];

/**
 * Arma la nómina de un informe a partir de `equipos`: quién vendió con quién.
 *
 * - Cada equipo, en el orden de `orden`, con sus roles en el orden del equipo.
 * - Supervisores y asesores van en grupos; el resto de roles, en secciones por rol.
 * - Cada asesor va con el supervisor con quien carga más ventas.
 */
export function buildPayroll(
  informe: CommissionReport,
  orden: { slug: string; nombre: string; roles: { rol: SalesRole; etiqueta: string }[] }[],
): Payroll {
  const filas: TeamRow[] = informe.equipos.filter((f) => f.ventas + f.pyme > 0);
  const persona = (id: number) => informe.personas[String(id)];

  const fuera = new Map<string, { ventas: number; donde: string }>();
  const ubicacion = new Map<string, string>();

  const equipos = orden.flatMap<PayrollTeam>((e) => {
    const pagos = informe.pagos.filter((p) => p.equipo === e.slug);
    if (pagos.length === 0) return [];
    const ofTeam = filas.filter((f) => f.equipo === e.slug);
    const byKey = new Map(pagos.map((p) => [p.persona_id, p]));

    // Con quién vende cada uno: quien vende → supervisor → ventas.
    const sellsWith = new Map<number, Map<string, number>>();
    for (const f of ofTeam) {
      if (f.medio_id === null) continue;
      const m = sellsWith.get(f.medio_id) ?? new Map<string, number>();
      const k = f.supervisor_id === null ? NONE : String(f.supervisor_id);
      m.set(k, (m.get(k) ?? 0) + f.ventas + f.pyme);
      sellsWith.set(f.medio_id, m);
    }

    const secciones: SeccionRol[] = e.roles
      .filter((r) => !ROLES_IN_GROUP.includes(r.rol))
      .map((r) => {
        const ofRole = pagos.filter((p) => p.rol === r.rol).sort(byNet);
        return { rol: r.rol, etiqueta: r.etiqueta, pagos: ofRole, usd: total(ofRole) };
      })
      .filter((s) => s.pagos.length > 0);

    const grupos = new Map<string, SupervisorGroup>();
    const grupo = (key: string): SupervisorGroup => {
      let g = grupos.get(key);
      if (!g) {
        const id = key === NONE ? null : Number(key);
        const pago = id !== null && byKey.get(id)?.rol === 'supervisor' ? byKey.get(id) ?? null : null;
        g = { key, id, nombre: id === null ? 'Sin supervisor' : pago?.nombre ?? persona(id)?.nombre ?? '—', pago, asesores: [], usd: 0 };
        grupos.set(key, g);
      }
      return g;
    };

    for (const p of pagos) {
      ubicacion.set(paymentKey(p), e.slug);
      if (p.rol === 'supervisor') {
        grupo(String(p.persona_id));
      } else if (p.rol === 'asesor') {
        const supKey = mayor(sellsWith.get(p.persona_id)) ?? NONE;
        // Un supervisor sin pago en este equipo (o una oficina) no encabeza grupo: «Sin supervisor».
        const key = supKey !== NONE && byKey.get(Number(supKey))?.rol === 'supervisor' ? supKey : NONE;
        grupo(key).asesores.push(p);
        const withOthers = [...(sellsWith.get(p.persona_id) ?? new Map<string, number>()).entries()]
          .reduce((t, [k, n]) => t + (k === supKey ? 0 : n), 0);
        if (withOthers) fuera.set(paymentKey(p), { ventas: withOthers, donde: 'otro supervisor' });
      }
    }
    for (const g of grupos.values()) {
      g.asesores.sort(byNet);
      g.usd = total([...(g.pago ? [g.pago] : []), ...g.asesores]);
    }
    const groupList = [...grupos.values()].sort((a, b) =>
      Number(a.key === NONE) - Number(b.key === NONE) || b.usd - a.usd || a.nombre.localeCompare(b.nombre));

    const personas = [...secciones.flatMap((s) => s.pagos), ...groupList.flatMap((g) => [...(g.pago ? [g.pago] : []), ...g.asesores])];
    return [{
      slug: e.slug,
      nombre: e.nombre,
      secciones,
      grupos: groupList,
      personas,
      ventas: ofTeam.reduce((t, f) => t + f.ventas + f.pyme, 0),
      usd: total(personas),
    }];
  });

  return { equipos, fuera, ubicacion };
}
