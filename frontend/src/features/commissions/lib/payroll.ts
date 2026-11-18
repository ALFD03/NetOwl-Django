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
  const sme = p.sme_sales - p.sme_without_pct;
  if (p.detail.paid_sales !== undefined) return p.detail.paid_sales + sme;
  if (p.role === 'coord_un' && p.detail.team_amount_per_sale === undefined) return p.own_sales + sme;
  return p.own_sales + p.team_sales + sme;
}

/** El tramo en el que cae una cantidad de ventas: el último que empieza en o antes. */
export function advisorTier(sales: number, tiers: PaymentTier[]): PaymentTier {
  let chosen = tiers[0];
  for (const tier of tiers) if (tier.since <= sales) chosen = tier;
  return chosen;
}

/** El siguiente tramo que paga más por venta; nulo en el último. */
export const nextTier = (sales: number, tiers: PaymentTier[]): PaymentTier | null =>
  tiers.find((t) => t.since > sales) ?? null;

/** Desde cuántas ventas empieza a cobrar quien cobra por tramos. */
export const minThatPays = (tiers: PaymentTier[]): number | null =>
  tiers.find((t) => t.amount > 0)?.since ?? null;

/** `6–19`, `20`, `26+`. */
export function tierRange(tier: PaymentTier, tiers: PaymentTier[]): string {
  const next = tiers[tiers.indexOf(tier) + 1];
  if (!next) return `${tier.since}+`;
  return next.since - 1 === tier.since ? String(tier.since) : `${tier.since}–${next.since - 1}`;
}

/**
 * Por qué cobra menos de lo que validó, o nada. Nulo si cobra todo.
 *
 * Es lo que acompaña a una fila atenuada: un $0 sin motivo se lee como un error.
 */
export function trimReason(p: CommissionPayment, tiers: PaymentTier[] | undefined): string | null {
  const withoutPercentage = p.sme_without_pct ? ` · ${p.sme_without_pct} PYME sin % de comisión` : '';
  if (p.detail.paid_sales !== undefined) {
    const paid = p.detail.paid_sales;
    const min = tiers ? minThatPays(tiers) : null;
    if (p.own_sales > 0 && !p.detail.amount_per_sale) {
      return `${p.own_sales} ${p.own_sales === 1 ? 'venta' : 'ventas'}: no llega a ${min ?? 'el primer tramo'}${withoutPercentage}`;
    }
    if (paid < p.own_sales) return `Su tramo descuenta ${p.own_sales - paid}${withoutPercentage}`;
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
export function paymentSales(p: CommissionPayment, sales: CommissionSale[], conditions: CommissionConditions): CommissionSale[] {
  const scope = conditions.teams?.[p.equipo]?.[p.role]?.equipo;
  return sales.filter((v) => {
    if (v.classification !== 'valida' || v.equipo !== p.equipo) return false;
    if (v.channel_id === p.person_id) return true;
    if (v.sme || !scope) return false;
    if (scope.exclude_office && v.is_office) return false;
    switch (scope.scope) {
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
  payment: CommissionPayment | null;
  advisors: CommissionPayment[];
  usd: number;
}

/** Los pagos de un rol de dirección dentro de un equipo (jefe, coordinadores, gerentes, oficinas...). */
export interface RoleSection {
  role: SalesRole;
  role_label: string;
  payments: CommissionPayment[];
  usd: number;
}

export interface PayrollTeam {
  slug: string;
  name: string;
  sections: RoleSection[];
  groups: SupervisorGroup[];
  /** Todos los que cobran en el equipo, cada uno una vez. */
  people: CommissionPayment[];
  /** Las ventas válidas del equipo. */
  sales: number;
  usd: number;
}

export interface Payroll {
  teams: PayrollTeam[];
  /** Ventas válidas de cada persona que quedaron con otro supervisor (incluidas en su pago), por `paymentKey`. */
  outside: Map<string, { sales: number; where: string }>;
  /** El equipo donde quedó cada pago, para el buscador. */
  location: Map<string, string>;
}

const total = (people: CommissionPayment[]) => Math.round(people.reduce((t, p) => t + p.net, 0) * 100) / 100;
const byNet = (a: CommissionPayment, b: CommissionPayment) => b.net - a.net || a.name.localeCompare(b.name);
/** La clave con más ventas; a igualdad, la menor, para que el reparto no dependa del orden. */
const largest = (m: Map<string, number> | undefined): string | null => {
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
  report: CommissionReport,
  order: { slug: string; name: string; roles: { role: SalesRole; role_label: string }[] }[],
): Payroll {
  const rows: TeamRow[] = report.teams.filter((f) => f.sales + f.sme > 0);
  const person = (id: number) => report.people[String(id)];

  const outside = new Map<string, { sales: number; where: string }>();
  const location = new Map<string, string>();

  const teams = order.flatMap<PayrollTeam>((e) => {
    const payments = report.payments.filter((p) => p.equipo === e.slug);
    if (payments.length === 0) return [];
    const ofTeam = rows.filter((f) => f.equipo === e.slug);
    const byKey = new Map(payments.map((p) => [p.person_id, p]));

    // Con quién vende cada uno: quien vende → supervisor → ventas.
    const sellsWith = new Map<number, Map<string, number>>();
    for (const f of ofTeam) {
      if (f.channel_id === null) continue;
      const m = sellsWith.get(f.channel_id) ?? new Map<string, number>();
      const k = f.supervisor_id === null ? NONE : String(f.supervisor_id);
      m.set(k, (m.get(k) ?? 0) + f.sales + f.sme);
      sellsWith.set(f.channel_id, m);
    }

    const sections: RoleSection[] = e.roles
      .filter((r) => !ROLES_IN_GROUP.includes(r.role))
      .map((r) => {
        const ofRole = payments.filter((p) => p.role === r.role).sort(byNet);
        return { role: r.role, role_label: r.role_label, payments: ofRole, usd: total(ofRole) };
      })
      .filter((s) => s.payments.length > 0);

    const groups = new Map<string, SupervisorGroup>();
    const group = (key: string): SupervisorGroup => {
      let g = groups.get(key);
      if (!g) {
        const id = key === NONE ? null : Number(key);
        const payment = id !== null && byKey.get(id)?.role === 'supervisor' ? byKey.get(id) ?? null : null;
        g = { key, id, name: id === null ? 'Sin supervisor' : payment?.name ?? person(id)?.name ?? '—', payment, advisors: [], usd: 0 };
        groups.set(key, g);
      }
      return g;
    };

    for (const p of payments) {
      location.set(paymentKey(p), e.slug);
      if (p.role === 'supervisor') {
        group(String(p.person_id));
      } else if (p.role === 'asesor') {
        const supKey = largest(sellsWith.get(p.person_id)) ?? NONE;
        // Un supervisor sin pago en este equipo (o una oficina) no encabeza grupo: «Sin supervisor».
        const key = supKey !== NONE && byKey.get(Number(supKey))?.role === 'supervisor' ? supKey : NONE;
        group(key).advisors.push(p);
        const withOthers = [...(sellsWith.get(p.person_id) ?? new Map<string, number>()).entries()]
          .reduce((t, [k, n]) => t + (k === supKey ? 0 : n), 0);
        if (withOthers) outside.set(paymentKey(p), { sales: withOthers, where: 'otro supervisor' });
      }
    }
    for (const g of groups.values()) {
      g.advisors.sort(byNet);
      g.usd = total([...(g.payment ? [g.payment] : []), ...g.advisors]);
    }
    const groupList = [...groups.values()].sort((a, b) =>
      Number(a.key === NONE) - Number(b.key === NONE) || b.usd - a.usd || a.name.localeCompare(b.name));

    const people = [...sections.flatMap((s) => s.payments), ...groupList.flatMap((g) => [...(g.payment ? [g.payment] : []), ...g.advisors])];
    return [{
      slug: e.slug,
      name: e.name,
      sections,
      groups: groupList,
      people,
      sales: ofTeam.reduce((t, f) => t + f.sales + f.sme, 0),
      usd: total(people),
    }];
  });

  return { teams, outside, location };
}
