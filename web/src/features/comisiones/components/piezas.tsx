/** Piezas pequeñas que comparten la nómina y los indicadores del informe de comisiones. */

import type { ReactNode } from 'react';

import { formatoPct } from '../lib/formato';
import { minimoQuePaga } from '../lib/nomina';
import type { CargoVentas, TramoAsesor } from '../types';

export const CARGO_CHIP: Record<CargoVentas, { label: string; tono: string }> = {
  coord_un: { label: 'Coord. de UN', tono: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
  coord_oficina: { label: 'Coord. de oficina', tono: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  supervisor: { label: 'Supervisor', tono: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  asesor: { label: 'Asesor', tono: 'border-slate-600/50 bg-slate-700/30 text-slate-300' },
};

export function ChipCargo({ cargo, children }: { cargo: CargoVentas; children?: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${CARGO_CHIP[cargo].tono}`}>
      {children ?? CARGO_CHIP[cargo].label}
    </span>
  );
}

/** Una cifra con su etiqueta, en una tarjeta. */
export function Kpi({
  label, children, nota, tono = 'text-slate-400',
}: { label: string; children: ReactNode; nota?: ReactNode; tono?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-slate-800 bg-surface-primary/60 px-4 py-3">
      <span className={`text-[10px] font-black uppercase tracking-wider ${tono}`}>{label}</span>
      <div className="font-mono text-xl font-black tabular-nums text-white">{children}</div>
      {nota && <div className="text-[11px] text-slate-500">{nota}</div>}
    </div>
  );
}

/** Validadas y pagadas juntas; en ámbar cuando se pagan menos de las que se validaron. */
export function VentasCelda({ validadas, pagadas }: { validadas: number; pagadas: number }) {
  return (
    <span className="inline-flex flex-col items-end font-mono tabular-nums">
      <span className="text-sm">
        <span className={`font-bold ${pagadas < validadas ? 'text-amber-300' : 'text-white'}`}>{pagadas}</span>
        <span className="text-slate-500"> / {validadas}</span>
      </span>
      {pagadas < validadas && <span className="text-[10px] text-amber-400/80">−{validadas - pagadas} sin pago</span>}
    </span>
  );
}

/** Un % de cumplimiento con su barra: verde al 100, ámbar por debajo. */
export function Medidor({ pct, nota }: { pct: number | null; nota: string }) {
  if (pct === null) return <span className="text-xs font-bold text-amber-400">Sin definir</span>;
  const lleno = pct >= 100;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-sm font-bold tabular-nums ${lleno ? 'text-emerald-300' : 'text-amber-300'}`}>{formatoPct(pct)}</span>
        <span className="truncate text-[10px] text-slate-500">{nota}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${lleno ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

/** Dónde caen las ventas de un asesor respecto a sus tramos, con una marca en cada inicio. */
export function BarraTramo({ ventas, tramos }: { ventas: number; tramos: TramoAsesor[] }) {
  const cortes = tramos.map((t) => t.desde).filter((d) => d > 0);
  const tope = Math.max(ventas, (cortes[cortes.length - 1] ?? 10) + 4);
  const paga = ventas >= (minimoQuePaga(tramos) ?? Infinity);
  return (
    <div className="relative mt-1 h-1.5 rounded-full bg-slate-800">
      <div className={`absolute inset-y-0 left-0 rounded-full ${paga ? 'bg-sky-500' : 'bg-slate-600'}`} style={{ width: `${(ventas / tope) * 100}%` }} />
      {cortes.map((c) => (
        <span key={c} className="absolute -top-0.5 h-2.5 w-px bg-slate-500" style={{ left: `${(c / tope) * 100}%` }} />
      ))}
    </div>
  );
}

/** Dónde cae un crecimiento respecto a los cortes que cambian el monto por venta. */
export function BarraCrecimiento({ pct, cortes }: { pct: number; cortes: number[] }) {
  const min = Math.min(-1, pct);
  const max = Math.max((cortes[cortes.length - 1] ?? 2) + 1, pct);
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="relative mt-1 h-1.5 rounded-full bg-slate-800">
      <div className="absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: `${pos(pct)}%` }} />
      {cortes.map((c) => (
        <span key={c} className="absolute -top-0.5 h-2.5 w-px bg-slate-500" style={{ left: `${pos(c)}%` }} />
      ))}
    </div>
  );
}
