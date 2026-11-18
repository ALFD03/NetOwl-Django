/** La cabecera del informe de comisiones: el total a pagar y los pasos del informe. */

import type { ReactNode } from 'react';
import { Check, HandCoins } from 'lucide-react';

import { formatAmount, formatBs, formatMonth, formatRate } from '../lib/format';
import type { BolivarRate, CommissionReport } from '../types';

/** Lo que hay que pagar: lo primero que se lee. */
export function PaymentTotal({
  report,
  period,
  totalUsd,
  rate,
  paymentTotalBs,
  paidCount,
  todayRate,
}: {
  report: CommissionReport;
  period: string;
  totalUsd: number;
  /** La tasa de pago (la de CONATEL del mes siguiente), o `null` si el informe no la lleva. */
  rate: number | null;
  paymentTotalBs: number | null;
  paidCount: number;
  /** La tasa oficial de hoy: solo una referencia. */
  todayRate: BolivarRate | null;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-transparent px-6 py-5">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-300">
          <HandCoins className="h-4 w-4" />
          Total a pagar · comisiones de {formatMonth(period)}
          <span
            className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] ${
              report.status === 'cerrado'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            {report.status === 'cerrado' ? 'Cerrado' : 'Borrador'}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="font-mono text-4xl font-black tabular-nums text-white">
            {formatAmount(totalUsd)}
          </p>
          <p className="font-mono text-2xl font-black tabular-nums text-emerald-300">
            {rate === null ? 'Bs —' : formatBs(paymentTotalBs)}
          </p>
        </div>
        <p className="mt-1.5 text-xs text-slate-400">
          <strong className="text-white">{paidCount}</strong>{' '}
          {paidCount === 1 ? 'persona cobra' : 'personas cobran'} ·{' '}
          <strong className="text-white">{report.summary.valid}</strong> ventas validadas
          {report.summary.valid_plan_change > 0 && (
            <> · {report.summary.valid_plan_change} por cambio de plan</>
          )}
        </p>
      </div>
      <div className="border-l border-slate-700/70 pl-5 text-right">
        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
          Tasa de pago · CONATEL {report.conatel_rate ? formatMonth(report.conatel_rate.month) : ''}
        </p>
        <p className="mt-0.5 font-mono text-xl font-black tabular-nums text-white">
          {formatRate(rate)}
        </p>
        <p className="text-[11px] text-slate-500">
          {rate !== null ? report.conatel_rate.source : report.conatel_rate?.warning || 'Sin tasa'}
        </p>
        <p
          className="mt-1 text-[11px] text-slate-500"
          title="Solo como referencia: no se usa para pagar"
        >
          Hoy {todayRate ? formatRate(todayRate.rate) : '…'} · solo referencia
        </p>
      </div>
    </div>
  );
}

export interface ReportStep<K extends string> {
  key: K;
  title: string;
  detail: string;
  done: boolean;
  pending: boolean;
  icon: ReactNode;
}

export function ReportStepsNav<K extends string>({
  steps,
  current,
  onSelect,
}: {
  steps: ReportStep<K>[];
  current: K;
  onSelect: (step: K) => void;
}) {
  return (
    <nav
      className="grid grid-cols-2 border-y border-slate-800 md:grid-cols-4"
      aria-label="Pasos del informe"
    >
      {steps.map((p, i) => {
        const active = current === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect(p.key)}
            aria-current={active ? 'step' : undefined}
            className={`flex items-start gap-3 border-b-2 px-5 py-3.5 text-left transition md:border-r md:border-r-slate-800 md:last:border-r-0 ${
              active
                ? 'border-b-sky-500 bg-sky-500/[0.06]'
                : 'border-b-transparent hover:bg-surface-tertiary/40'
            }`}
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-xs font-bold ${
                p.done
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : p.pending
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : active
                      ? 'border-sky-500 text-sky-300'
                      : 'border-slate-700 text-slate-400'
              }`}
            >
              {p.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">{p.title}</span>
              <span
                className={`block truncate text-xs ${p.pending ? 'text-amber-300' : 'text-slate-400'}`}
              >
                {p.detail}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
