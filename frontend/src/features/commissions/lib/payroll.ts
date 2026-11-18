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
export const validatedSales = (p: CommissionPayment): number => p.own_sales + p.team_sales + p.sme_sales;

/**
 * De sus validadas, las que se pagan.
 *
 * Solo quien cobra por tramos (asesores, telemarketing) y el coordinador de UN
 * sin crecimiento conocido cobran menos ventas de las que validaron. Los demás
 * cobran todas: su cumplimiento recorta el monto, no las ventas. La PYME de un
 * plan sin % no se paga.
 */
export function paidSales(p: CommissionPayment): number {
  const pyme = p.sme_sales - p.sme_without_pct;
  if (p.detail.paid_sales !== undefined) return p.detail.paid_sales + pyme;
  if (p.role === 'coord_un' && p.detail.team_amount_per_sale === undefined) return p.own_sales + pyme;
  return p.own_sales + p.team_sales + pyme;
}

/** El tramo en el que cae una cantidad de ventas: el último que empieza en o antes. */
export function advisorTier(ventas: number, tramos: PaymentTier[]): PaymentTier {
  let elegido = tramos[0];
  for (const tramo of tramos) if (tramo.since <= ventas) elegido = tramo;
  return elegido;
}

/** El siguiente tramo que paga más por venta; nulo en el último. */
export const nextTier = (ventas: number, tramos: PaymentTier[]): PaymentTier | null =>
  tramos.find((t) => t.since > ventas) ?? null;

/** Desde cuántas ventas empieza a cobrar quien cobra por tramos. */
export const minimoQuePaga = (tramos: PaymentTier[]): number | null =>
  tramos.find((t) => t.amount > 0)?.since ?? null;

/** `6–19`, `20`, `26+`. */
export function tierRange(tramo: PaymentTier, tramos: PaymentTier[]): string {
  const next = tramos[tramos.indexOf(tramo) + 1];
  if (!next) return `${tramo.since}+`;
  return next.since - 1 === tramo.since ? String(tramo.since) : `${tramo.since}–${next.since - 1}`;
}

/**
 * Por qué cobra menos de lo que validó, o nada. Nulo si cobra todo.
 *
 * Es lo que acompaña a una fila atenuada: un $0 sin motivo se lee como un error.
 */
export function trimReason(p: CommissionPayment, tramos: PaymentTier[] | undefined): string | null {
  const withoutPercentage = p.sme_without_pct ? ` · ${p.sme_without_pct} PYME sin % de comisión` : '';
  if (p.detail.paid_sales !== undefined) {
    const pagadas = p.detail.paid_sales;
    const minimo = tramos ? minimoQuePaga(tramos) : null;
    if (p.own_sales > 0 && !p.detail.amount_per_sale) {
      return `${p.own_sales} ${p.own_sales === 1 ? 'venta' : 'ventas'}: no llega a ${minimo ?? 'el primer tramo'}${withoutPercentage}`;
    }
    if (pagadas < p.own_sales) return `Su tramo descuenta ${p.own_sales - pagadas}${withoutPercentage}`;
  }
  if (p.role === 'coord_un' && p.detail.team_amount_per_sale === undefined && p.team_sales) {
    return `Crecimiento desconocido: las ${p.team_sales} ventas de su equipo no se pagan${withoutPercentage}`;
  }
  if (p.factor_pct !== null && p.factor_pct < 100) {
    return `Cobra el ${formatPctValue(p.factor_pct)} de ${formatAmount(p.gross)}${withoutPercentage}`;
  }
  return withoutPercentage ? withoutPercentage.slice(3) : null;
}

/** Los bonos de un pago, uno por línea: `Meta de 30 ventas: +$120,00`. Vacío si no cobra ninguno. */
export const bonusNotes = (p: CommissionPayment): string[] =>
  (p.detail.bonuses ?? []).map((b) => `${b.concept}: +${formatAmount(b.amount)}`);

/**
 * Las ventas válidas por las que cobra un pago: las que hizo él mismo y las de su
 * alcance de equipo (`equipo.alcance` de sus condiciones), sin las de oficina si
 * las excluye. Es lo mismo que decide `pagos.calcular_pagos` en el servidor.
 */
export function paymentSales(p: CommissionPayment, ventas: CommissionSale[], condiciones: CommissionConditions): CommissionSale[] {
  const alcance = condiciones.teams?.[p.equipo]?.[p.role]?.equipo;
  return ventas.filter((v) => {
    if (v.classification !== 'valida' || v.equipo !== p.equipo) return false;
    if (v.channel_id === p.person_id) return true;
    if (v.sme || !alcance) return false;
    if (alcance.exclude_office && v.is_office) return false;
    switch (alcance.scope) {
      case 'supervisados': return v.supervisor_id === p.person_id;
      case 'oficina': return v.office_coord_id === p.person_id;
      case 'unidades': return v.units.some((u) => p.units.includes(u));
      case 'equipo_completo': return true;
      default: return false;
    }
  });
}

// --- La jerarquía -------------------------------------------------------------------

/** La clave de un pago en la nómina: una persona puede cobrar en dos equipos. */
export const paymentKey = (p: Pick<CommissionPayment, 'person_id' | 'equipo'>): string => `${p.person_id}:${p.equipo}`;

const NONE = 'sin';

/** Los asesores que cargan sus ventas con un mismo supervisor. */
export interface SupervisorGroup {
  key: string;
  id: number | null;
  name: string;
  /** Su pago si es un supervisor del equipo; nulo si no lo es o la venta no lo trae. */
  pago: CommissionPayment | null;
  advisors: CommissionPayment[];
  usd: number;
}

/** Los pagos de un rol de dirección dentro de un equipo (jefe, coordinadores, gerentes, oficinas...). */
export interface SeccionRol {
  role: SalesRole;
  role_label: string;
  payments: CommissionPayment[];
  usd: number;
}

export interface PayrollTeam {
  slug: string;
  name: string;
  secciones: SeccionRol[];
  grupos: SupervisorGroup[];
  /** Todos los que cobran en el equipo, cada uno una vez. */
  people: CommissionPayment[];
  /** Las ventas válidas del equipo. */
  sales: number;
  usd: number;
}

export interface Payroll {
  teams: PayrollTeam[];
  /** Ventas válidas de cada persona que quedaron con otro supervisor (incluidas en su pago), por `paymentKey`. */
  fuera: Map<string, { sales: number; donde: string }>;
  /** El equipo donde quedó cada pago, para el buscador. */
  ubicacion: Map<string, string>;
}

const total = (personas: CommissionPayment[]) => Math.round(personas.reduce((t, p) => t + p.net, 0) * 100) / 100;
const byNet = (a: CommissionPayment, b: CommissionPayment) => b.net - a.net || a.name.localeCompare(b.name);
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
  orden: { slug: string; name: string; roles: { role: SalesRole; role_label: string }[] }[],
): Payroll {
  const filas: TeamRow[] = informe.teams.filter((f) => f.sales + f.sme > 0);
  const persona = (id: number) => informe.people[String(id)];

  const fuera = new Map<string, { sales: number; donde: string }>();
  const ubicacion = new Map<string, string>();

  const equipos = orden.flatMap<PayrollTeam>((e) => {
    const pagos = informe.payments.filter((p) => p.equipo === e.slug);
    if (pagos.length === 0) return [];
    const ofTeam = filas.filter((f) => f.equipo === e.slug);
    const byKey = new Map(pagos.map((p) => [p.person_id, p]));

    // Con quién vende cada uno: quien vende → supervisor → ventas.
    const sellsWith = new Map<number, Map<string, number>>();
    for (const f of ofTeam) {
      if (f.channel_id === null) continue;
      const m = sellsWith.get(f.channel_id) ?? new Map<string, number>();
      const k = f.supervisor_id === null ? NONE : String(f.supervisor_id);
      m.set(k, (m.get(k) ?? 0) + f.sales + f.sme);
      sellsWith.set(f.channel_id, m);
    }

    const secciones: SeccionRol[] = e.roles
      .filter((r) => !ROLES_IN_GROUP.includes(r.role))
      .map((r) => {
        const ofRole = pagos.filter((p) => p.role === r.role).sort(byNet);
        return { role: r.role, role_label: r.role_label, payments: ofRole, usd: total(ofRole) };
      })
      .filter((s) => s.payments.length > 0);

    const grupos = new Map<string, SupervisorGroup>();
    const grupo = (key: string): SupervisorGroup => {
      let g = grupos.get(key);
      if (!g) {
        const id = key === NONE ? null : Number(key);
        const pago = id !== null && byKey.get(id)?.role === 'supervisor' ? byKey.get(id) ?? null : null;
        g = { key, id, name: id === null ? 'Sin supervisor' : pago?.name ?? persona(id)?.name ?? '—', pago, advisors: [], usd: 0 };
        grupos.set(key, g);
      }
      return g;
    };

    for (const p of pagos) {
      ubicacion.set(paymentKey(p), e.slug);
      if (p.role === 'supervisor') {
        grupo(String(p.person_id));
      } else if (p.role === 'asesor') {
        const supKey = mayor(sellsWith.get(p.person_id)) ?? NONE;
        // Un supervisor sin pago en este equipo (o una oficina) no encabeza grupo: «Sin supervisor».
        const key = supKey !== NONE && byKey.get(Number(supKey))?.role === 'supervisor' ? supKey : NONE;
        grupo(key).advisors.push(p);
        const withOthers = [...(sellsWith.get(p.person_id) ?? new Map<string, number>()).entries()]
          .reduce((t, [k, n]) => t + (k === supKey ? 0 : n), 0);
        if (withOthers) fuera.set(paymentKey(p), { sales: withOthers, donde: 'otro supervisor' });
      }
    }
    for (const g of grupos.values()) {
      g.advisors.sort(byNet);
      g.usd = total([...(g.pago ? [g.pago] : []), ...g.advisors]);
    }
    const groupList = [...grupos.values()].sort((a, b) =>
      Number(a.key === NONE) - Number(b.key === NONE) || b.usd - a.usd || a.name.localeCompare(b.name));

    const personas = [...secciones.flatMap((s) => s.payments), ...groupList.flatMap((g) => [...(g.pago ? [g.pago] : []), ...g.advisors])];
    return [{
      slug: e.slug,
      name: e.name,
      secciones,
      grupos: groupList,
      people: personas,
      sales: ofTeam.reduce((t, f) => t + f.sales + f.sme, 0),
      usd: total(personas),
    }];
  });

  return { teams: equipos, fuera, ubicacion };
}
