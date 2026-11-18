/** Tipos del módulo de Comisiones: lo que mandan `services/commissions/views.py` y `analytics/`. */

import type { PaymentParameters, SalesRole } from '@/shared/types/subscriptions';

export type { SalesRole };

/** `diferida`: instalada en los días promocionales del mes sin adelantar el pago; cuenta en el periodo siguiente. */
export type Classification = 'valida' | 'no_pagada' | 'revision' | 'excluida' | 'diferida';

/**
 * En qué parte de la ventana se instaló (`reglas.tramo`): los días promocionales
 * del mes anterior, del día 1 a los del mes, los del mes, o fuera de la ventana
 * (agregada a mano).
 */
export type SaleTier = 'promo_anterior' | 'regular' | 'promo' | 'manual';

/**
 * Las decisiones a mano: `contar`/`no_contar` resuelven una venta en revisión;
 * `ya_pagada`/`normal`, en el primer periodo, si lo instalado en los días
 * promocionales del mes anterior ya se cobró en él.
 */
export type ReviewDecision = 'contar' | 'no_contar' | 'ya_pagada' | 'normal';

/** Un periodo creado, con su ventana de instalación. */
export interface CommissionPeriod {
  period: string;
  status: 'borrador' | 'cerrado';
  start: string;
  /** Último día de instalación que puede contar: el fin del mes. */
  end: string;
  /** Desde aquí, lo instalado solo cuenta si se adelantó el pago hasta `corte_adelantos`. */
  promo_start: string;
  advance_cutoff: string;
}

/** Un bono de un pago, con el concepto que lo explica. */
export interface PaymentBonus {
  concept: string;
  amount: number;
  /** Solo en el bono por unidad del jefe de UN. */
  unit_id?: number;
}

/**
 * El desglose de un pago (`pagos.Pago.detalle`): lo que aplica a su rol.
 * Asesor y telemarketing: `tramo_desde`, `monto_por_venta`, `ventas_pagadas`, `bono_desde`. Coord. de UN:
 * `crecimiento_pct`, `monto_por_venta_equipo` y `churn_bruto_pct`. Supervisor: `asesores`.
 */
export interface PaymentDetail {
  tier_since?: number;
  amount_per_sale?: number;
  paid_sales?: number;
  bonus_since?: number | null;
  growth_pct?: number | null;
  team_amount_per_sale?: number;
  gross_churn_pct?: number | null;
  company_pct?: number | null;
  advisors?: number;
  /** `site` o `unidad`: de dónde sale el % que multiplica. */
  factor?: 'site' | 'unidad';
  bonuses: PaymentBonus[];
}

/** Lo que cobra una persona en un equipo en el periodo (`pagos.Pago` más su ficha). */
export interface CommissionPayment {
  person_id: number;
  name: string;
  channel: string;
  /** El slug del equipo y su nombre; el rol que cumple en él. */
  equipo: string;
  team_name: string;
  role: SalesRole;
  site: string;
  own_sales: number;
  team_sales: number;
  sme_sales: number;
  sme_amount: number;
  sme_without_pct: number;
  own_amount: number;
  team_amount: number;
  gross: number;
  /** % de cumplimiento aplicado (tope 100); nulo en quien no lo usa. */
  factor_pct: number | null;
  /** Los bonos sumados al neto; cada uno con su concepto en `detalle.bonos`. */
  bonus: number;
  net: number;
  /** El que se aplica: el escrito a mano si lo tiene, si no el calculado; nulo es "sin definir". */
  compliance_pct: number | null;
  /** El escrito a mano solo para esta persona; nulo es que vale el calculado. */
  own_compliance: number | null;
  /** De dónde sale el % aplicado (`calculo._indicadores`). */
  compliance?: IndicatorFactor | null;
  growth_pct: number | null;
  computed_growth: number | null;
  growth_source: 'manual' | 'unidades de negocio' | null;
  units: string[];
  detail: PaymentDetail;
  warnings: string[];
}

/** Un site o una unidad y su % Ventas del mes; `pct` nulo si el mes no está analizado o no tiene meta. */
export interface ComplianceSource {
  name: string;
  pct: number | null;
}

/**
 * El % de cumplimiento que multiplica el pago de una persona y de dónde sale.
 *
 * Manda el escrito a mano; si no, el calculado: el % Ventas de su site, o el
 * promedio simple de las unidades de negocio que le tocan (`fuentes`). Sin
 * ninguno queda sin definir, y el cierre lo pide.
 */
export interface IndicatorFactor {
  person_id: number;
  equipo: string;
  role: SalesRole;
  name: string;
  factor: 'site' | 'unidad';
  sources: ComplianceSource[];
  computed: number | null;
  manual: number | null;
  value: number | null;
  source: 'manual' | 'site' | 'unidad' | null;
  /** Coordinadora: sus ventas como «Medio» contra su objetivo de ventas. Solo informa. */
  personal: { sales: number; target: number | null; pct: number | null } | null;
}

/** El crecimiento y el churn bruto de la unidad de un coordinador de UN. */
export interface IndicatorGrowth {
  person_id: number;
  equipo: string;
  role: SalesRole;
  name: string;
  units: string[];
  computed: number | null;
  manual: number | null;
  value: number | null;
  source: 'manual' | 'unidades de negocio' | null;
  gross_churn: number | null;
}

/** Los indicadores del mes que condicionan el pago (`calculo._indicadores`). */
export interface ReportIndicators {
  /** Falso si el mes no está analizado: nada se calcula y todo cae a lo escrito. */
  analyzed: boolean;
  factors: IndicatorFactor[];
  growths: IndicatorGrowth[];
  /** El % de ingresos de cada unidad: lo que mide el bono del jefe de UN. */
  unit_inflows: { unit_id: number; unit: string; inflows_pct: number | null; sales_pct: number | null }[];
  /** Toda la empresa: el bono de la administradora. */
  company: { sales_pct: number | null; inflows_pct: number | null } | null;
}

/** Una venta candidata del periodo, clasificada y con sus personas. */
export interface CommissionSale {
  order: string;
  client: string;
  since_date: string;
  branch: string;
  zone: string;
  product: string;
  sme: boolean;
  price: number;
  sme_pct: number | null;
  status: string;
  billing_status: string;
  classification: Classification;
  reason: string;
  /** Lo que dicen las facturas, sin la decisión manual: por qué fue a revisión. */
  analysis_reason: string;
  decision: ReviewDecision | null;
  review_note: string;
  /** Falta en periodos cerrados antes de existir los días promocionales adelantados. */
  tier?: SaleTier;
  manual?: boolean;
  manual_note?: string;
  /** Días promocionales del mes con la primera mensualidad pagada hasta el corte: cuenta en este periodo. */
  is_advanced?: boolean;
  /**
   * Primer periodo, días promocionales del mes anterior: pagó la mensualidad antes
   * del corte de ese mes (pudo cobrarse allí), pagaría aquí y nadie confirmó todavía.
   */
  to_confirm?: boolean;
  /**
   * Se ve en «Días promocionales del mes anterior»: por confirmar, ya confirmada
   * allí, o (con el anterior cerrado) cobrada en él. Lo que otra regla resolvió no.
   */
  review_promo?: boolean;
  /** Hoy es gratuita (archivada, tarifa «Gratis» o archivada en los logs): no paga comisión. */
  is_free: boolean;
  /** Día en que se canceló, si hoy está «Cancelado» y los logs lo fechan; vacío si no. */
  cancelled_on: string;
  /** Cuántas facturas tiene la orden en el export de facturas. */
  invoices: number;
  /** La primera mensualidad: la que decide si se pagó. Vacíos si no tiene ninguna. */
  invoice_number: string;
  invoice_date: string;
  invoice_status: string;
  invoice_payment: string;
  invoice_plan: string;
  /**
   * Hasta cuándo se sabe que estaba pagada: la «Fecha del último pago», si no la
   * «Última actualización el» y si no el «Creado el» (aproximado). Vacío sin pagar.
   */
  paid_date?: string;
  paid_source?: 'pago' | 'actualizacion' | 'creacion' | '';
  channel: string;
  supervisor_channel: string;
  seller: string;
  channel_id: number | null;
  supervisor_id: number | null;
  office_coord_id: number | null;
  /** El slug del equipo de la venta: el del `Medio`. Vacío si no se pudo saber. */
  equipo: string;
  /** Las unidades de negocio de la venta, por la cadena supervisor → su superior. */
  unit_ids: number[];
  units: string[];
  /** Quien vendió es una coordinadora de oficina. */
  is_office: boolean;
  warnings: string[];
}

export interface CommissionReport {
  period: string;
  start: string;
  end: string;
  promo_start: string;
  /** Hasta qué día un pago adelantado de los días promocionales cuenta aquí. */
  advance_cutoff?: string;
  /** El corte del mes anterior: con él se sugiere qué se cobró ya allí. */
  previous_cutoff?: string;
  /** El periodo del mes anterior; `estado` nulo si no existe (y entonces se confirma a mano). */
  previous?: { period: string; status: 'borrador' | 'cerrado' | null };
  /** Si el export de facturas trae «Fecha del último pago». */
  invoices_with_paid_date?: boolean;
  status: 'borrador' | 'cerrado';
  /** Desde cuándo tiene sentido calcular: las primeras facturas ya deberían estar pagadas. */
  compute_from: string;
  too_early: boolean;
  /** Cuándo se cargó el export de facturas con que se clasificó (falta en periodos cerrados antes de existir). */
  invoices_imported_at?: string;
  /**
   * La tasa en bolívares con que se paga: la de CONATEL del mes siguiente (`mes`),
   * la misma del reporte ETA. Nula si aún no se publicó o el servicio falló (`aviso`).
   */
  conatel_rate: BolivarRate & { month: string; warning: string };
  summary: {
    candidates: number;
    valid: number;
    unpaid: number;
    review: number;
    excluded: number;
    valid_sme: number;
    /** Por facturar con la primera mensualidad pagada de otro plan: valen sin revisión. */
    valid_plan_change: number;
    valid_without_channel: number;
    valid_without_team?: number;
    /** Lo que sigue faltando en los periodos cerrados antes de los adelantos. */
    deferred?: number;
    promo?: number;
    advanced?: number;
    previous_promo?: number;
    previous_promo_paid?: number;
    promo_to_confirm?: number;
    previous_promo_review?: number;
    manual_sales?: number;
    /** Lo que suman todos los bonos (incluido en `total`). */
    bonuses?: number;
    total: number;
  };
  payments: CommissionPayment[];
  /** Los indicadores del mes que condicionan el pago. */
  indicators: ReportIndicators;
  /** Quién vendió con quién en las ventas válidas. */
  teams: TeamRow[];
  /** Nombre y papeles (equipo, rol, superior, unidades, site) de cada id de `equipos` y de `pagos`, cobre o no. */
  people: Record<string, { name: string; positions: PersonRole[] }>;
  review: CommissionSale[];
  manual_sales?: ManualSale[];
  /** Lo que impide cerrar. Vacío: se puede cerrar. */
  close_blockers: string[];
}

/** Una venta agregada a mano al periodo. */
export interface ManualSale {
  order: string;
  note: string;
  added_by: string;
  added_at: string;
  /** Nula si la orden ya no está en suscripciones. */
  sale: CommissionSale | null;
}

/** El papel de una persona en un equipo, con lo que la nómina necesita para ordenarla. */
export interface PersonRole {
  equipo: string;
  role: SalesRole;
  /** La persona a la que responde un supervisor (coordinador o gerente de UN). */
  manager_id: number | null;
  units: string[];
  site: string;
}

/** Una combinación de equipo, oficina, supervisor y quien vendió, con sus ventas válidas. */
export interface TeamRow {
  equipo: string;
  office_coord_id: number | null;
  supervisor_id: number | null;
  channel_id: number | null;
  /** Válidas residenciales. */
  sales: number;
  /** Válidas PYME. */
  sme: number;
}

/** Una tasa del BCV en bolívares por dólar y de dónde salió. */
export interface BolivarRate {
  rate: number | null;
  source: string;
}

/** Lo que propone el formulario del periodo. */
export interface PeriodProposal {
  period: string;
  start: string;
  /** Falso si el mes anterior tiene periodo: el inicio sale de él. */
  ask_start: boolean;
  promo_start: string;
  advance_cutoff: string;
}

export interface CommissionsReportProps {
  period: string;
  periods: CommissionPeriod[];
  /** Nulo si el periodo todavía no existe (o si su cálculo falló: ver `error`). */
  report: CommissionReport | null;
  error: string | null;
  proposal: PeriodProposal;
  /** Las del cierre si el periodo está cerrado; si no, las vigentes, con las que se calculó. */
  conditions: CommissionConditions;
  /** Los equipos y sus roles, para nombrar y ordenar la nómina. */
  teams: { slug: string; name: string; roles: { role: SalesRole; role_label: string }[] }[];
  canManage: boolean;
  /** `can_reopen_commissions`: reabrir va aparte de gestionar. */
  canReopen: boolean;
  /** `can_delete_commissions`: borrar un informe en borrador, con su propio permiso. */
  canDelete: boolean;
  /** Las versiones archivadas de los cierres anteriores del periodo, la más reciente primero. */
  archives: ArchivedClose[];
}

/** Un cierre guardado al reabrir el periodo (sin la copia, que se pide al descargarlo). */
export interface ArchivedClose {
  id: number;
  version: number;
  closed_by: string;
  closed_at: string | null;
  reopened_by: string;
  reopened_at: string;
  reason: string;
  net_total: number;
  payments: number;
  sales: number;
}

/** La copia completa de un cierre archivado: lo que había congelado al reabrirlo. */
export interface CloseSnapshot {
  period: { period: string; conatel_rate: string | null; closed_by: string | null; closed_at: string | null };
  conditions: CommissionConditions;
  summary: CommissionReport;
  sales: { order: string; classification: string; data: CommissionSale }[];
}

/**
 * Las condiciones con que se calcula: la ventana de pago y, por equipo y rol, los
 * valores de cada pieza (`catalogos.equipos`). Las de un cierre son la copia que se congeló.
 */
export interface CommissionConditions {
  promo_day: number;
  wait_days: number;
  /** Día del mes siguiente hasta el que un pago adelantado cuenta en el periodo. */
  cutoff_day: number;
  teams?: Record<string, Record<string, PaymentParameters>>;
  /** El nombre de cada equipo por su slug. */
  names?: Record<string, string>;
}

export interface SmePlan {
  id: number;
  name: string;
  tariff: string;
  price: number;
  sme_commission_pct: number | null;
}

/** La última vez que se guardaron las condiciones; nulos si nunca se guardaron desde la página. */
export interface ConditionsUpdate {
  at: string | null;
  by: string | null;
}

export interface CommissionsConditionsProps {
  conditions: CommissionConditions;
  last_update: ConditionsUpdate;
  smePlans: SmePlan[];
  canEditPlans: boolean;
}
