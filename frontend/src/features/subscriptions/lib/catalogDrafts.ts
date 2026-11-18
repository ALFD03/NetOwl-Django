/**
 * Los borradores de los formularios de Catálogos: una fila en edición por
 * catálogo, la pestaña activa y la sugerencia de alta de una persona a partir
 * del literal del export.
 */

import type {
  CatalogArea,
  CatalogRoleCondition,
  CatalogPlan,
  CatalogRegulatoryPlan,
  CatalogTargetLevel,
  PaymentParameters,
  SalesRole,
  TargetsTrafficLight,
} from '@/features/subscriptions/types';

/** Una fila en edición. Sin `id` es un alta. */
export type PlanDraft = Omit<CatalogPlan, 'id'> & { id?: number };
export type RegulatoryDraft = Omit<CatalogRegulatoryPlan, 'id' | 'plans'> & { id?: number };
export type ZoneDraft = {
  id?: number;
  name: string;
  site_id: number | null;
  state_id: number | null;
  technology: string;
  coordinator_id: number | null;
};
/** Un site en edición: sus zonas y los equipos que lo trabajan se eligen en el mismo formulario. */
export type SiteDraft = {
  id?: number;
  name: string;
  order: number;
  zone_ids: number[];
  team_ids: number[];
};
export type NameDraft = { id?: number; name: string; kind: 'estados' };
/**
 * El papel de una persona en un equipo, en edición. En el alta se elige una
 * persona que ya existe (`persona_id`) o se escribe una nueva; equipo y rol no
 * cambian después.
 */
export type MembershipDraft = {
  id?: number;
  team_id: number;
  /** El slug del equipo, para saber qué roles y qué exige cada uno. */
  equipo: string;
  role: SalesRole;
  person_id: number | null;
  name: string;
  last_name: string;
  channel: string;
  supervisor_channel: string;
  odoo_user: string;
  /** Otros nombres de la misma persona en cada columna del export. */
  channel_alias: string[];
  supervisor_alias: string[];
  user_alias: string[];
  site_ids: number[];
  manager_id: number | null;
  unit_ids: number[];
};
export type UnitDraft = { id?: number; name: string; zone_ids: number[]; team_ids: number[] };
/** Las condiciones de un rol de un equipo en edición: se manda el objeto entero de parámetros. */
export type ConditionDraft = {
  team_id: number;
  role: SalesRole;
  role_label: string;
  equipo: string;
  pieces: CatalogRoleCondition['pieces'];
  params: PaymentParameters;
  policy: PaymentParameters;
};
/**
 * Un tramo del objetivo de ventas de las oficinas. `persona_id` nulo es el
 * general; las ventas van como texto para que el campo pueda quedar vacío.
 */
export type OfficeTargetDraft = {
  id?: number;
  person_id: number | null;
  /** Quién lo tiene, para enseñarlo al editar (la persona no se cambia). */
  role_label?: string;
  since: string;
  ventas: string;
  note: string;
};
export type IgnoredDraft = { id?: number; name: string; note: string; area: CatalogArea };

/**
 * Un tramo de objetivo en edición. Los porcentajes van como texto porque vacío
 * significa algo —"se hereda"— y un `number` no puede estar vacío.
 */
export type TargetDraft = {
  id?: number;
  level: CatalogTargetLevel;
  entity_id: number | null;
  /** La zona de un nodo, por nombre: los nodos salen de los datos, no del catálogo. */
  entity_name?: string;
  /** En los niveles `sucursal` y `zona_sucursal`. */
  sucursal: string;
  /** Cómo se llama lo que tiene el objetivo, para enseñarlo al editar. */
  role_label?: string;
  /** `YYYY-MM`; vacío es "desde siempre". */
  since: string;
  growth_pct: string;
  churn_pct: string;
  note: string;
  /** El objetivo general: uno solo, sin fecha ni valores vacíos. */
  isBase?: boolean;
};
export type MonthTargetDraft = {
  id?: number;
  period: string;
  growth_pct: string;
  churn_pct: string;
  note: string;
};
export type TrafficLightDraft = TargetsTrafficLight;

/**
 * La pestaña activa. Las de Productos, Estructura y Notificaciones son nombres
 * fijos; las de Ventas llevan sección: `estructura/unidades`, `estructura/sites`,
 * `estructura/objetivos` y, por equipo, `<slug>/<rol>` y `<slug>/condiciones`.
 */
export type CatalogView = string;

/** Los roles que aparecen en `Vendedor` (usuario de Odoo) y no en `Medio`. */
const ROLES_WITH_USER: SalesRole[] = ['coord_oficina', 'administradora'];

/**
 * Una membresía en blanco del rol y equipo indicados, rellena a partir del
 * literal del export si lo hay.
 *
 * El literal de `Vendedor` (coordinadora de oficina, administradora) es el
 * nombre completo con `(User)`: va entero al usuario de Odoo, y de él se
 * adivinan nombre, apellido y medio —dos nombres y dos apellidos es lo
 * habitual—. Los de `Medio` son ya nombre + apellido y van al medio. Todo
 * queda editable: es una sugerencia.
 */
export function membershipSince(
  literal: string,
  role: SalesRole,
  teamId: number,
  team: string,
): MembershipDraft {
  const base = literal.replace(/\s*\(\s*users?\s*\)\s*$/i, '').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const empty = {
    team_id: teamId,
    equipo: team,
    role,
    person_id: null,
    supervisor_channel: '',
    site_ids: [] as number[],
    manager_id: null,
    channel_alias: [] as string[],
    supervisor_alias: [] as string[],
    user_alias: [] as string[],
    unit_ids: [] as number[],
  };
  if (ROLES_WITH_USER.includes(role)) {
    const cutoff = parts.length >= 4 ? 2 : 1;
    return {
      ...empty,
      name: parts.slice(0, cutoff).join(' '),
      last_name: parts.slice(cutoff).join(' '),
      channel: role === 'coord_oficina' ? [parts[0], parts[cutoff]].filter(Boolean).join(' ') : '',
      odoo_user: literal ? `${base} (User)` : '',
    };
  }
  return {
    ...empty,
    name: parts[0] ?? '',
    last_name: parts.slice(1).join(' '),
    channel: base,
    odoo_user: '',
  };
}
