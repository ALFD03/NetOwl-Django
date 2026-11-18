/** Piezas pequeñas que comparten la nómina y los indicadores del informe de comisiones. */

import type { ReactNode } from 'react';

import { formatDateValue, formatPctValue } from '../lib/format';
import { minThatPays } from '../lib/payroll';
import type { SalesRole, CommissionSale } from '../types';
import type { PaymentTier } from '@/shared/types/subscriptions';

const DIRECTION_TONE = 'border-violet-500/30 bg-violet-500/10 text-violet-300';

/** Cómo se rotula cada rol en la nómina: nombre corto y color. */
export const CHIP_ROLE: Record<SalesRole, { label: string; tone: string }> = {
  jefe: { label: 'Jefe', tone: DIRECTION_TONE },
  jefe_un: { label: 'Jefe de UN', tone: DIRECTION_TONE },
  coord_un: { label: 'Coord. de UN', tone: DIRECTION_TONE },
  gerente_un: { label: 'Gerente de UN', tone: DIRECTION_TONE },
  gerente_ops: { label: 'Gerente de operaciones', tone: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300' },
  coord_oficina: { label: 'Coord. de oficina', tone: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  supervisor: { label: 'Supervisor', tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  asesor: { label: 'Asesor', tone: 'border-slate-600/50 bg-slate-700/30 text-slate-300' },
  administradora: { label: 'Administradora', tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  telemarketing: { label: 'Telemarketing', tone: 'border-slate-600/50 bg-slate-700/30 text-slate-300' },
};

export function RoleChip({ role, children }: { role: SalesRole; children?: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${CHIP_ROLE[role].tone}`}>
      {children ?? CHIP_ROLE[role].label}
    </span>
  );
}

/** Una cifra con su etiqueta, en una tarjeta. */
export function Kpi({
  label, children, note, tone: tone = 'text-slate-400',
}: { label: string; children: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-slate-800 bg-surface-primary/60 px-4 py-3">
      <span className={`text-[10px] font-black uppercase tracking-wider ${tone}`}>{label}</span>
      <div className="font-mono text-xl font-black tabular-nums text-white">{children}</div>
      {note && <div className="text-[11px] text-slate-500">{note}</div>}
    </div>
  );
}

/** Validadas y pagadas juntas; en ámbar cuando se pagan menos de las que se validaron. */
export function SalesCell({ validated, paid }: { validated: number; paid: number }) {
  return (
    <span className="inline-flex flex-col items-end font-mono tabular-nums">
      <span className="text-sm">
        <span className={`font-bold ${paid < validated ? 'text-amber-300' : 'text-white'}`}>{paid}</span>
        <span className="text-slate-500"> / {validated}</span>
      </span>
      {paid < validated && <span className="text-[10px] text-amber-400/80">−{validated - paid} sin pago</span>}
    </span>
  );
}

/** Un % de cumplimiento con su barra: verde al 100, ámbar por debajo. */
export function Gauge({ pct, note }: { pct: number | null; note: string }) {
  if (pct === null) return <span className="text-xs font-bold text-amber-400">Sin definir</span>;
  const full = pct >= 100;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-sm font-bold tabular-nums ${full ? 'text-emerald-300' : 'text-amber-300'}`}>{formatPctValue(pct)}</span>
        <span className="truncate text-[10px] text-slate-500">{note}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${full ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

/** Dónde caen las ventas de un asesor respecto a sus tramos, con una marca en cada inicio. */
export function TierBar({ sales, tiers }: { sales: number; tiers: PaymentTier[] }) {
  const cuts = tiers.map((t) => t.since).filter((d) => d > 0);
  const cap = Math.max(sales, (cuts[cuts.length - 1] ?? 10) + 4);
  const pays = sales >= (minThatPays(tiers) ?? Infinity);
  return (
    <div className="relative mt-1 h-1.5 rounded-full bg-slate-800">
      <div className={`absolute inset-y-0 left-0 rounded-full ${pays ? 'bg-sky-500' : 'bg-slate-600'}`} style={{ width: `${(sales / cap) * 100}%` }} />
      {cuts.map((c) => (
        <span key={c} className="absolute -top-0.5 h-2.5 w-px bg-slate-500" style={{ left: `${(c / cap) * 100}%` }} />
      ))}
    </div>
  );
}

/** Dónde cae un crecimiento respecto a los cortes que cambian el monto por venta. */
export function GrowthBar({ pct, cuts }: { pct: number; cuts: number[] }) {
  const min = Math.min(-1, pct);
  const max = Math.max((cuts[cuts.length - 1] ?? 2) + 1, pct);
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="relative mt-1 h-1.5 rounded-full bg-slate-800">
      <div className="absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: `${pos(pct)}%` }} />
      {cuts.map((c) => (
        <span key={c} className="absolute -top-0.5 h-2.5 w-px bg-slate-500" style={{ left: `${pos(c)}%` }} />
      ))}
    </div>
  );
}

const PAYMENT_SOURCE: Record<string, string> = {
  actualizacion: 'por «Última actualización el»',
  creation: 'por «Creado el»: aproximada',
};

/**
 * Hasta cuándo se sabe que la primera mensualidad estaba pagada. Sin «Fecha del
 * último pago» en el export se lee de otra columna, y se dice cuál.
 */
export function PaidOn({ sale }: { sale: CommissionSale }) {
  if (!sale.paid_date) return <span className="text-slate-500">—</span>;
  const source = sale.paid_source ? PAYMENT_SOURCE[sale.paid_source] : undefined;
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-mono text-xs text-slate-200">{formatDateValue(sale.paid_date)}</span>
      {source && <span className="text-[10px] text-slate-500">{source}</span>}
    </span>
  );
}

/** Pagado y En proceso de pago cuentan; lo demás no (tampoco «Pagado parcialmente»). */
const PAYMENT_TONE: Record<string, string> = {
  Pagado: 'text-emerald-400',
  'En proceso de pago': 'text-emerald-400',
};

/**
 * La primera mensualidad de una venta: número, fecha, plan y cómo está.
 * Una venta anterior a las facturas (periodo cerrado antes) no trae los campos.
 */
export function FirstInstallment({ sale }: { sale: CommissionSale }) {
  if (!sale.invoice_number) {
    return <span className="text-slate-500">{sale.invoices ? `Sin mensualidad (${sale.invoices} facturas)` : 'Sin facturas'}</span>;
  }
  const cancelled = sale.invoice_status === 'Cancelado' || sale.invoice_status === 'Borrador';
  return (
    <span className="flex flex-col leading-tight" title={sale.invoice_plan}>
      <span className="font-mono text-xs text-slate-300">
        {sale.invoice_number} · {formatDateValue(sale.invoice_date)}
      </span>
      <span className={`text-xs font-semibold ${cancelled ? 'text-rose-400' : PAYMENT_TONE[sale.invoice_payment] ?? 'text-amber-400'}`}>
        {cancelled ? sale.invoice_status : sale.invoice_payment || 'Sin estado de pago'}
      </span>
    </span>
  );
}
