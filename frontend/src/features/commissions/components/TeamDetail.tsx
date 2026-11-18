/** Comisiones › Nómina: un equipo de ventas con sus roles de dirección, sus supervisores y los asesores de cada uno. */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pencil } from 'lucide-react';

import { aBs, formatBs, formatAmount, formatPctValue, complianceSource, totalBs } from '../lib/format';
import {
  paymentKey, trimReason, bonusNotes, tierRange, nextTier, advisorTier, paidSales, validatedSales,
  type PayrollTeam, type SupervisorGroup, type Payroll,
} from '../lib/payroll';
import type { CommissionConditions, CommissionPayment } from '../types';
import { GrowthBar, TierBar, RoleChip, Kpi, Gauge, SalesCell } from './pieces';

/** Las columnas de las filas de personas: nombre, indicador, ventas, $ y Bs. */
export const PERSON_COLUMNS = 'grid grid-cols-[minmax(220px,1fr)_220px_104px_128px_168px] items-center gap-x-4';
const NUM = 'text-right font-mono tabular-nums';

export interface DetailProps {
  conditions: CommissionConditions;
  rate: number | null;
  /** Pago encontrado con el buscador (`paymentKey`): su fila se marca. */
  highlighted: string | null;
  onViewPerson: (payment: CommissionPayment) => void;
  /** Lleva al paso de indicadores; nulo si no se puede editar. */
  onEditIndicators: (() => void) | null;
}

/** El botón discreto que lleva a donde se escribe un %: la nómina no edita nada. */
export function EditIndicator({ onClick }: { onClick: (() => void) | null }) {
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} title="Editar en Indicadores" className="rounded p-1 text-slate-500 hover:bg-sky-500/10 hover:text-sky-300">
      <Pencil className="h-3 w-3" />
    </button>
  );
}

/** Las condiciones de un pago: las del rol en su equipo. */
const tiersOf = (p: CommissionPayment, conditions: CommissionConditions) =>
  conditions.teams?.[p.equipo]?.[p.role]?.tramos_asesor;

/** Lo que va bajo un nombre: por qué cobra menos, sus bonos y si tiene ventas con otro supervisor. */
function Notes({ p, payroll, conditions }: { p: CommissionPayment; payroll: Payroll; conditions: CommissionConditions }) {
  const reason = trimReason(p, tiersOf(p, conditions));
  const bonuses = bonusNotes(p);
  const outside = payroll.outside.get(paymentKey(p));
  if (!reason && !bonuses.length && !outside && !p.warnings.length) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
      {reason && <span className={p.net === 0 ? 'text-slate-400' : ''}>{reason}</span>}
      {bonuses.map((b) => <span key={b} className="font-semibold text-amber-400">{b}</span>)}
      {outside && <span>+{outside.sales} con {outside.where} (incluidas)</span>}
      {p.warnings.length > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-400" title={p.warnings.join('\n')}>
          <AlertTriangle className="h-3 w-3" />
          {p.warnings.length === 1 ? 'Un aviso' : `${p.warnings.length} avisos`}
        </span>
      )}
    </div>
  );
}

function Name({ p, onViewPerson }: { p: CommissionPayment; onViewPerson: (payment: CommissionPayment) => void }) {
  return (
    <button
      type="button"
      onClick={() => onViewPerson(p)}
      title="Ver los clientes por los que cobra"
      className="truncate text-left text-sm font-semibold text-white hover:text-sky-300 hover:underline"
    >
      {p.name}
    </button>
  );
}

/** El tramo de quien cobra por tramos, con la barra y lo que le falta para el siguiente. */
function IndicatorTiers({ p, conditions }: { p: CommissionPayment; conditions: CommissionConditions }) {
  const tiers = tiersOf(p, conditions);
  if (!tiers?.length) return <span />;
  const tier = advisorTier(p.own_sales, tiers);
  const next = nextTier(p.own_sales, tiers);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={tier.amount > 0 ? 'font-semibold text-slate-200' : 'text-slate-500'}>
          {tier.amount > 0 ? `Tramo ${tierRange(tier, tiers)} · ${formatAmount(tier.amount)}` : 'Sin tramo'}
        </span>
        <span className="truncate text-[10px] text-slate-500">
          {next ? `faltan ${next.since - p.own_sales} para ${formatAmount(next.amount)}` : 'tramo máximo'}
        </span>
      </div>
      <TierBar sales={p.own_sales} tiers={tiers} />
    </div>
  );
}

/** Lo que mide a cada rol, en la columna central de su fila. */
function Indicator({ p, conditions, onEditIndicators }: { p: CommissionPayment; conditions: CommissionConditions; onEditIndicators: (() => void) | null }) {
  if (p.detail.paid_sales !== undefined) return <IndicatorTiers p={p} conditions={conditions} />;

  if (p.role === 'coord_un') {
    const step = conditions.teams?.[p.equipo]?.[p.role]?.escalon_crecimiento;
    const perSale = p.detail.team_amount_per_sale ?? 0;
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          {p.growth_pct === null ? (
            <span className="text-xs font-bold text-amber-400">Crecimiento desconocido</span>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-bold tabular-nums text-violet-300">{formatPctValue(p.growth_pct)}</span>
                <span className="truncate text-[10px] text-slate-500">
                  {p.growth_source === 'manual' ? 'a mano' : 'crecimiento'} → {formatAmount(perSale)}/venta
                </span>
              </div>
              <GrowthBar pct={p.growth_pct} cuts={step ? [step.threshold_pct] : []} />
            </>
          )}
        </div>
        <EditIndicator onClick={onEditIndicators} />
      </div>
    );
  }

  if (p.detail.factor) {
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><Gauge pct={p.factor_pct} note={complianceSource(p)} /></div>
        <EditIndicator onClick={onEditIndicators} />
      </div>
    );
  }
  if (p.role === 'administradora') {
    return <span className="text-xs text-slate-300">Empresa al {formatPctValue(p.detail.company_pct ?? null)}</span>;
  }
  return <span />;
}

/** Lo que va bajo el nombre de quien dirige: cuántas ventas y de qué. */
function Summary({ p }: { p: CommissionPayment }) {
  const parts = [
    p.own_sales ? `${p.own_sales} propias` : '',
    p.team_sales ? `${p.team_sales} de su equipo` : '',
    p.detail.advisors ? `${p.detail.advisors} ${p.detail.advisors === 1 ? 'asesor' : 'asesores'}` : '',
    p.units.length ? p.units.join(', ') : '',
    p.site ? `site ${p.site}` : '',
  ].filter(Boolean);
  return parts.length ? <div className="mt-0.5 text-[11px] text-slate-500">{parts.join(' · ')}</div> : null;
}

function PersonRow({
  p, payroll, indent = false, emphasized = false, ...props
}: DetailProps & { p: CommissionPayment; payroll: Payroll; indent?: boolean; emphasized?: boolean }) {
  const highlight = props.highlighted === paymentKey(p);
  return (
    <div
      id={`persona-${paymentKey(p)}`}
      className={`${PERSON_COLUMNS} px-4 py-2.5 transition ${emphasized ? 'bg-surface-primary/70' : 'border-t border-slate-800/60'} ${
        highlight ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40' : 'hover:bg-slate-800/30'
      } ${p.net === 0 ? 'opacity-60' : ''}`}
    >
      <div className={`min-w-0 ${indent ? 'pl-4' : ''}`}>
        <div className="flex min-w-0 items-center gap-2">
          <Name p={p} onViewPerson={props.onViewPerson} />
          {p.role !== 'asesor' && <RoleChip role={p.role} />}
        </div>
        {!indent && <Summary p={p} />}
        <Notes p={p} payroll={payroll} conditions={props.conditions} />
      </div>
      <Indicator p={p} conditions={props.conditions} onEditIndicators={props.onEditIndicators} />
      <div className="text-right"><SalesCell validated={validatedSales(p)} paid={paidSales(p)} /></div>
      <span className={`${NUM} flex flex-col text-sm font-bold text-white`}>
        {formatAmount(p.net)}
        {p.factor_pct !== null && p.factor_pct < 100 && <span className="text-[10px] font-normal text-slate-500">de {formatAmount(p.gross)}</span>}
      </span>
      <span className={`${NUM} text-sm font-bold text-emerald-300`}>{formatBs(aBs(p.net, props.rate))}</span>
    </div>
  );
}

/** La franja que pliega o despliega un bloque: flecha, título y lo que esconde. */
function Collapser({ isOpen, onToggle, children, right, tone: tone = 'normal' }: {
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  right?: ReactNode;
  tone?: 'normal' | 'suave';
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className={`flex w-full items-center justify-between gap-3 px-4 text-left transition hover:bg-slate-800/40 ${
        tone === 'suave' ? 'border-t border-slate-800/60 py-1.5' : 'border-b border-slate-800 bg-surface-primary/70 py-2'
      } ${isOpen ? '' : 'border-b-0'}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
        {children}
      </span>
      {right}
    </button>
  );
}

function Group({
  g, payroll, isOpen, onToggle, ...props
}: DetailProps & { g: SupervisorGroup; payroll: Payroll; isOpen: boolean; onToggle: () => void }) {
  const totalUsd = Math.round(g.advisors.reduce((t, a) => t + a.net, 0) * 100) / 100;
  const people = `${g.advisors.length} ${g.advisors.length === 1 ? (g.payment ? 'asesor' : 'persona') : (g.payment ? 'asesores' : 'personas')}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/40">
      {g.payment && <PersonRow p={g.payment} payroll={payroll} emphasized {...props} />}
      <Collapser
        isOpen={isOpen}
        onToggle={onToggle}
        tone={g.payment ? 'suave' : 'normal'}
        right={<span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">{formatAmount(totalUsd)}</span>}
      >
        {g.payment ? (
          <span className="text-[11px] text-slate-400">{isOpen ? 'Ocultar' : 'Mostrar'} {people}</span>
        ) : (
          <>
            <span className="truncate text-sm font-bold text-slate-200">{g.name}</span>
            <span className="shrink-0 text-[11px] text-slate-500">{people}</span>
          </>
        )}
      </Collapser>
      {isOpen && g.advisors.map((a) => <PersonRow key={paymentKey(a)} p={a} payroll={payroll} indent {...props} />)}
    </div>
  );
}

/** El detalle de un equipo: sus cifras, los roles de dirección y cada grupo de supervisor. */
export function TeamDetail({ team, payroll, ...props }: DetailProps & { team: PayrollTeam; payroll: Payroll }) {
  // Lo plegado: `kpi`, `sec:<rol>` y `grp:<supervisor>`. Todo empieza abierto, y el equipo se
  // remonta al cambiar (`key` en la nómina), así que cada uno recuerda lo suyo solo mientras se mira.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsedIds((before) => {
      const next = new Set(before);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const keys = [...team.sections.map((s) => `sec:${s.role}`), ...team.groups.map((g) => `grp:${g.key}`)];
  const collapsedAll = keys.every((k) => collapsedIds.has(k));

  // Quien se busca está dentro de un bloque plegado: se abre y se lleva a la vista. Se ajusta al
  // renderizar, al cambiar el buscado (no en un efecto), para no pintar antes el bloque cerrado.
  const { highlighted } = props;
  const [handled, setHandled] = useState<string | null>(null);
  if (highlighted !== handled) {
    setHandled(highlighted);
    if (highlighted !== null) {
      const inside = [
        ...team.sections.filter((s) => s.payments.some((p) => paymentKey(p) === highlighted)).map((s) => `sec:${s.role}`),
        ...team.groups.filter((g) => g.advisors.some((a) => paymentKey(a) === highlighted)).map((g) => `grp:${g.key}`),
      ];
      if (inside.some((k) => collapsedIds.has(k))) setCollapsedIds(new Set([...collapsedIds].filter((k) => !inside.includes(k))));
    }
  }
  useEffect(() => {
    if (highlighted === null) return;
    const id = requestAnimationFrame(() =>
      document.getElementById(`persona-${highlighted}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return () => cancelAnimationFrame(id);
  }, [highlighted]);

  const advisors = team.groups.flatMap((g) => g.advisors);
  const validatedAdvisors = advisors.reduce((t, p) => t + validatedSales(p), 0);
  const paidAdvisors = advisors.reduce((t, p) => t + paidSales(p), 0);
  const bonuses = Math.round(team.people.reduce((t, p) => t + p.bonus, 0) * 100) / 100;
  const supervisorCount = team.groups.filter((g) => g.payment).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="truncate text-xl font-black text-white">{team.name}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">
            {team.people.length} {team.people.length === 1 ? 'persona' : 'personas'}
            {supervisorCount > 0 && ` · ${supervisorCount} ${supervisorCount === 1 ? 'supervisor' : 'supervisores'}`}
          </span>
          <button
            type="button"
            onClick={() => toggle('kpi')}
            aria-expanded={!collapsedIds.has('kpi')}
            className="rounded-lg border border-slate-700/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800/60"
          >
            {collapsedIds.has('kpi') ? 'Mostrar resumen' : 'Ocultar resumen'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsedIds(collapsedAll ? new Set(collapsedIds.has('kpi') ? ['kpi'] : []) : new Set([...collapsedIds, ...keys]))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800/60"
          >
            {collapsedAll ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
            {collapsedAll ? 'Expandir todo' : 'Contraer todo'}
          </button>
        </div>
      </div>

      {!collapsedIds.has('kpi') && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Ventas validadas" note="las del equipo">{team.sales}</Kpi>
        <Kpi label="Pagadas a asesores" note={validatedAdvisors > paidAdvisors ? `${validatedAdvisors - paidAdvisors} bajo tramo` : 'todas'}>
          <span className={paidAdvisors < validatedAdvisors ? 'text-amber-300' : ''}>{paidAdvisors}</span>
          <span className="text-sm font-bold text-slate-500"> / {validatedAdvisors}</span>
        </Kpi>
        <Kpi label="Bonos" tone="text-amber-300" note="incluidos en lo que cobran">{formatAmount(bonuses)}</Kpi>
        <Kpi label="Equipo en $" note="todo lo que cobran sus personas">{formatAmount(team.usd)}</Kpi>
        <Kpi label="Equipo en Bs" tone="text-emerald-300" note="a tasa CONATEL">
          <span className="text-lg text-emerald-300">{formatBs(totalBs(team.people.map((p) => p.net), props.rate))}</span>
        </Kpi>
      </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[860px] space-y-3">
          <div className={`${PERSON_COLUMNS} px-4 text-[10px] font-black uppercase tracking-wider text-slate-400`}>
            <span>Persona</span>
            <span>Cumplimiento · crecimiento · tramo</span>
            <span className="text-right">Pagadas / valid.</span>
            <span className="text-right">A pagar $</span>
            <span className="text-right">A pagar Bs · CONATEL</span>
          </div>
          {team.sections.map((s) => (
            <div key={s.role} className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/40">
              <Collapser
                isOpen={!collapsedIds.has(`sec:${s.role}`)}
                onToggle={() => toggle(`sec:${s.role}`)}
                right={<span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">{formatAmount(s.usd)}</span>}
              >
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">{s.role_label}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{s.payments.length} {s.payments.length === 1 ? 'persona' : 'personas'}</span>
              </Collapser>
              {!collapsedIds.has(`sec:${s.role}`) && s.payments.map((p) => <PersonRow key={paymentKey(p)} p={p} payroll={payroll} {...props} />)}
            </div>
          ))}
          {team.groups.map((g) => (
            <Group key={g.key} g={g} payroll={payroll} isOpen={!collapsedIds.has(`grp:${g.key}`)} onToggle={() => toggle(`grp:${g.key}`)} {...props} />
          ))}
        </div>
      </div>
    </div>
  );
}
