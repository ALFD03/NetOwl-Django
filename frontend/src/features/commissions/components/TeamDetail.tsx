/** Comisiones › Nómina: un equipo de ventas con sus roles de dirección, sus supervisores y los asesores de cada uno. */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pencil } from 'lucide-react';

import { aBs, formatBs, formatAmount, formatPctValue, complianceSource, totalBs } from '../lib/format';
import {
  paymentKey, trimReason, bonusNotes, tierRange, nextTier, advisorTier, paidSales, validatedSales,
  type PayrollTeam, type SupervisorGroup, type Payroll,
} from '../lib/payroll';
import type { CommissionConditions, CommissionPayment } from '../types';
import { BarraCrecimiento, TierBar, ChipRol, Kpi, Medidor, SalesCell } from './pieces';

/** Las columnas de las filas de personas: nombre, indicador, ventas, $ y Bs. */
export const PERSON_COLUMNS = 'grid grid-cols-[minmax(220px,1fr)_220px_104px_128px_168px] items-center gap-x-4';
const NUM = 'text-right font-mono tabular-nums';

export interface DetailProps {
  conditions: CommissionConditions;
  rate: number | null;
  /** Pago encontrado con el buscador (`paymentKey`): su fila se marca. */
  resaltado: string | null;
  onViewPerson: (pago: CommissionPayment) => void;
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
const tiersOf = (p: CommissionPayment, condiciones: CommissionConditions) =>
  condiciones.teams?.[p.equipo]?.[p.role]?.tramos_asesor;

/** Lo que va bajo un nombre: por qué cobra menos, sus bonos y si tiene ventas con otro supervisor. */
function Notes({ p, nomina, conditions }: { p: CommissionPayment; nomina: Payroll; conditions: CommissionConditions }) {
  const motivo = trimReason(p, tiersOf(p, conditions));
  const bonos = bonusNotes(p);
  const fuera = nomina.fuera.get(paymentKey(p));
  if (!motivo && !bonos.length && !fuera && !p.warnings.length) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
      {motivo && <span className={p.net === 0 ? 'text-slate-400' : ''}>{motivo}</span>}
      {bonos.map((b) => <span key={b} className="font-semibold text-amber-400">{b}</span>)}
      {fuera && <span>+{fuera.sales} con {fuera.donde} (incluidas)</span>}
      {p.warnings.length > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-400" title={p.warnings.join('\n')}>
          <AlertTriangle className="h-3 w-3" />
          {p.warnings.length === 1 ? 'Un aviso' : `${p.warnings.length} avisos`}
        </span>
      )}
    </div>
  );
}

function Name({ p, onViewPerson: onVerPersona }: { p: CommissionPayment; onViewPerson: (pago: CommissionPayment) => void }) {
  return (
    <button
      type="button"
      onClick={() => onVerPersona(p)}
      title="Ver los clientes por los que cobra"
      className="truncate text-left text-sm font-semibold text-white hover:text-sky-300 hover:underline"
    >
      {p.name}
    </button>
  );
}

/** El tramo de quien cobra por tramos, con la barra y lo que le falta para el siguiente. */
function IndicatorTiers({ p, conditions }: { p: CommissionPayment; conditions: CommissionConditions }) {
  const tramos = tiersOf(p, conditions);
  if (!tramos?.length) return <span />;
  const tramo = advisorTier(p.own_sales, tramos);
  const next = nextTier(p.own_sales, tramos);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={tramo.amount > 0 ? 'font-semibold text-slate-200' : 'text-slate-500'}>
          {tramo.amount > 0 ? `Tramo ${tierRange(tramo, tramos)} · ${formatAmount(tramo.amount)}` : 'Sin tramo'}
        </span>
        <span className="truncate text-[10px] text-slate-500">
          {next ? `faltan ${next.since - p.own_sales} para ${formatAmount(next.amount)}` : 'tramo máximo'}
        </span>
      </div>
      <TierBar sales={p.own_sales} tramos={tramos} />
    </div>
  );
}

/** Lo que mide a cada rol, en la columna central de su fila. */
function Indicator({ p, conditions, onEditIndicators: onEditarIndicadores }: { p: CommissionPayment; conditions: CommissionConditions; onEditIndicators: (() => void) | null }) {
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
              <BarraCrecimiento pct={p.growth_pct} cortes={step ? [step.threshold_pct] : []} />
            </>
          )}
        </div>
        <EditIndicator onClick={onEditarIndicadores} />
      </div>
    );
  }

  if (p.detail.factor) {
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><Medidor pct={p.factor_pct} note={complianceSource(p)} /></div>
        <EditIndicator onClick={onEditarIndicadores} />
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
  const partes = [
    p.own_sales ? `${p.own_sales} propias` : '',
    p.team_sales ? `${p.team_sales} de su equipo` : '',
    p.detail.advisors ? `${p.detail.advisors} ${p.detail.advisors === 1 ? 'asesor' : 'asesores'}` : '',
    p.units.length ? p.units.join(', ') : '',
    p.site ? `site ${p.site}` : '',
  ].filter(Boolean);
  return partes.length ? <div className="mt-0.5 text-[11px] text-slate-500">{partes.join(' · ')}</div> : null;
}

function PersonRow({
  p, nomina, sangria = false, destacada = false, ...props
}: DetailProps & { p: CommissionPayment; nomina: Payroll; sangria?: boolean; destacada?: boolean }) {
  const resaltar = props.resaltado === paymentKey(p);
  return (
    <div
      id={`persona-${paymentKey(p)}`}
      className={`${PERSON_COLUMNS} px-4 py-2.5 transition ${destacada ? 'bg-surface-primary/70' : 'border-t border-slate-800/60'} ${
        resaltar ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40' : 'hover:bg-slate-800/30'
      } ${p.net === 0 ? 'opacity-60' : ''}`}
    >
      <div className={`min-w-0 ${sangria ? 'pl-4' : ''}`}>
        <div className="flex min-w-0 items-center gap-2">
          <Name p={p} onViewPerson={props.onViewPerson} />
          {p.role !== 'asesor' && <ChipRol role={p.role} />}
        </div>
        {!sangria && <Summary p={p} />}
        <Notes p={p} nomina={nomina} conditions={props.conditions} />
      </div>
      <Indicator p={p} conditions={props.conditions} onEditIndicators={props.onEditIndicators} />
      <div className="text-right"><SalesCell validadas={validatedSales(p)} pagadas={paidSales(p)} /></div>
      <span className={`${NUM} flex flex-col text-sm font-bold text-white`}>
        {formatAmount(p.net)}
        {p.factor_pct !== null && p.factor_pct < 100 && <span className="text-[10px] font-normal text-slate-500">de {formatAmount(p.gross)}</span>}
      </span>
      <span className={`${NUM} text-sm font-bold text-emerald-300`}>{formatBs(aBs(p.net, props.rate))}</span>
    </div>
  );
}

/** La franja que pliega o despliega un bloque: flecha, título y lo que esconde. */
function Plegador({ abierto, onToggle, children, derecha, tono = 'normal' }: {
  abierto: boolean;
  onToggle: () => void;
  children: ReactNode;
  derecha?: ReactNode;
  tono?: 'normal' | 'suave';
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={abierto}
      className={`flex w-full items-center justify-between gap-3 px-4 text-left transition hover:bg-slate-800/40 ${
        tono === 'suave' ? 'border-t border-slate-800/60 py-1.5' : 'border-b border-slate-800 bg-surface-primary/70 py-2'
      } ${abierto ? '' : 'border-b-0'}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {abierto ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
        {children}
      </span>
      {derecha}
    </button>
  );
}

function Group({
  g, nomina, abierto, onToggle, ...props
}: DetailProps & { g: SupervisorGroup; nomina: Payroll; abierto: boolean; onToggle: () => void }) {
  const totalUsd = Math.round(g.advisors.reduce((t, a) => t + a.net, 0) * 100) / 100;
  const personas = `${g.advisors.length} ${g.advisors.length === 1 ? (g.pago ? 'asesor' : 'persona') : (g.pago ? 'asesores' : 'personas')}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/40">
      {g.pago && <PersonRow p={g.pago} nomina={nomina} destacada {...props} />}
      <Plegador
        abierto={abierto}
        onToggle={onToggle}
        tono={g.pago ? 'suave' : 'normal'}
        derecha={<span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">{formatAmount(totalUsd)}</span>}
      >
        {g.pago ? (
          <span className="text-[11px] text-slate-400">{abierto ? 'Ocultar' : 'Mostrar'} {personas}</span>
        ) : (
          <>
            <span className="truncate text-sm font-bold text-slate-200">{g.name}</span>
            <span className="shrink-0 text-[11px] text-slate-500">{personas}</span>
          </>
        )}
      </Plegador>
      {abierto && g.advisors.map((a) => <PersonRow key={paymentKey(a)} p={a} nomina={nomina} sangria {...props} />)}
    </div>
  );
}

/** El detalle de un equipo: sus cifras, los roles de dirección y cada grupo de supervisor. */
export function TeamDetail({ equipo, nomina, ...props }: DetailProps & { equipo: PayrollTeam; nomina: Payroll }) {
  // Lo plegado: `kpi`, `sec:<rol>` y `grp:<supervisor>`. Todo empieza abierto, y el equipo se
  // remonta al cambiar (`key` en la nómina), así que cada uno recuerda lo suyo solo mientras se mira.
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());
  const alternar = (clave: string) =>
    setPlegados((antes) => {
      const next = new Set(antes);
      if (!next.delete(clave)) next.add(clave);
      return next;
    });
  const keys = [...equipo.secciones.map((s) => `sec:${s.role}`), ...equipo.grupos.map((g) => `grp:${g.key}`)];
  const todoPlegado = keys.every((k) => plegados.has(k));

  // Quien se busca está dentro de un bloque plegado: se abre y se lleva a la vista. Se ajusta al
  // renderizar, al cambiar el buscado (no en un efecto), para no pintar antes el bloque cerrado.
  const { resaltado } = props;
  const [atendido, setAtendido] = useState<string | null>(null);
  if (resaltado !== atendido) {
    setAtendido(resaltado);
    if (resaltado !== null) {
      const dentro = [
        ...equipo.secciones.filter((s) => s.payments.some((p) => paymentKey(p) === resaltado)).map((s) => `sec:${s.role}`),
        ...equipo.grupos.filter((g) => g.advisors.some((a) => paymentKey(a) === resaltado)).map((g) => `grp:${g.key}`),
      ];
      if (dentro.some((k) => plegados.has(k))) setPlegados(new Set([...plegados].filter((k) => !dentro.includes(k))));
    }
  }
  useEffect(() => {
    if (resaltado === null) return;
    const id = requestAnimationFrame(() =>
      document.getElementById(`persona-${resaltado}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return () => cancelAnimationFrame(id);
  }, [resaltado]);

  const asesores = equipo.grupos.flatMap((g) => g.advisors);
  const validadasAsesores = asesores.reduce((t, p) => t + validatedSales(p), 0);
  const pagadasAsesores = asesores.reduce((t, p) => t + paidSales(p), 0);
  const bonos = Math.round(equipo.people.reduce((t, p) => t + p.bonus, 0) * 100) / 100;
  const supervisores = equipo.grupos.filter((g) => g.pago).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="truncate text-xl font-black text-white">{equipo.name}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">
            {equipo.people.length} {equipo.people.length === 1 ? 'persona' : 'personas'}
            {supervisores > 0 && ` · ${supervisores} ${supervisores === 1 ? 'supervisor' : 'supervisores'}`}
          </span>
          <button
            type="button"
            onClick={() => alternar('kpi')}
            aria-expanded={!plegados.has('kpi')}
            className="rounded-lg border border-slate-700/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800/60"
          >
            {plegados.has('kpi') ? 'Mostrar resumen' : 'Ocultar resumen'}
          </button>
          <button
            type="button"
            onClick={() => setPlegados(todoPlegado ? new Set(plegados.has('kpi') ? ['kpi'] : []) : new Set([...plegados, ...keys]))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800/60"
          >
            {todoPlegado ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
            {todoPlegado ? 'Expandir todo' : 'Contraer todo'}
          </button>
        </div>
      </div>

      {!plegados.has('kpi') && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Ventas validadas" note="las del equipo">{equipo.sales}</Kpi>
        <Kpi label="Pagadas a asesores" note={validadasAsesores > pagadasAsesores ? `${validadasAsesores - pagadasAsesores} bajo tramo` : 'todas'}>
          <span className={pagadasAsesores < validadasAsesores ? 'text-amber-300' : ''}>{pagadasAsesores}</span>
          <span className="text-sm font-bold text-slate-500"> / {validadasAsesores}</span>
        </Kpi>
        <Kpi label="Bonos" tono="text-amber-300" note="incluidos en lo que cobran">{formatAmount(bonos)}</Kpi>
        <Kpi label="Equipo en $" note="todo lo que cobran sus personas">{formatAmount(equipo.usd)}</Kpi>
        <Kpi label="Equipo en Bs" tono="text-emerald-300" note="a tasa CONATEL">
          <span className="text-lg text-emerald-300">{formatBs(totalBs(equipo.people.map((p) => p.net), props.rate))}</span>
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
          {equipo.secciones.map((s) => (
            <div key={s.role} className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/40">
              <Plegador
                abierto={!plegados.has(`sec:${s.role}`)}
                onToggle={() => alternar(`sec:${s.role}`)}
                derecha={<span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">{formatAmount(s.usd)}</span>}
              >
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">{s.role_label}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{s.payments.length} {s.payments.length === 1 ? 'persona' : 'personas'}</span>
              </Plegador>
              {!plegados.has(`sec:${s.role}`) && s.payments.map((p) => <PersonRow key={paymentKey(p)} p={p} nomina={nomina} {...props} />)}
            </div>
          ))}
          {equipo.grupos.map((g) => (
            <Group key={g.key} g={g} nomina={nomina} abierto={!plegados.has(`grp:${g.key}`)} onToggle={() => alternar(`grp:${g.key}`)} {...props} />
          ))}
        </div>
      </div>
    </div>
  );
}
