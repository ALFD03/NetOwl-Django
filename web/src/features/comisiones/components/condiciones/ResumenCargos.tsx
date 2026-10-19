/**
 * Quién cobra qué por cada venta, de un vistazo, y el recorrido de una venta
 * residencial por las cuatro columnas que nombran a alguien.
 */

import type { ReactNode } from 'react';
import { Info, LayoutGrid, Route } from 'lucide-react';

import { NeonContainer } from '@/shared/ui';
import { formatoMonto } from '../../lib/formato';
import type { CargoVentas, CondicionesComision } from '../../types';
import { ChipCargo } from '../piezas';
import { CABECERA, Nota } from './campos';

/** `$1,00 a $2,00`, o una sola cifra si todos pagan lo mismo. */
function entre(montos: number[]): string {
  const minimo = Math.min(...montos);
  const maximo = Math.max(...montos);
  return minimo === maximo ? formatoMonto(minimo) : `${formatoMonto(minimo)} a ${formatoMonto(maximo)}`;
}

interface FilaCargo {
  cargo: CargoVentas;
  columna: string;
  propia: ReactNode;
  equipo: ReactNode;
  multiplica: ReactNode;
}

const NADA = <span className="text-slate-600">—</span>;
const CUMPLIMIENTO = (
  <span className="font-semibold text-emerald-400">
    % de cumplimiento <span className="font-normal text-slate-500">(tope 100%)</span>
  </span>
);

export function ResumenCargos({ condiciones: c }: { condiciones: CondicionesComision }) {
  const montosAsesor = c.tramos_asesor.map((t) => t.monto);
  const filas: FilaCargo[] = [
    {
      cargo: 'asesor',
      columna: 'Medio',
      propia: <>Según su tramo <span className="text-slate-500">· {entre(montosAsesor)}</span></>,
      equipo: NADA,
      multiplica: <span className="text-slate-500">Nada</span>,
    },
    {
      cargo: 'supervisor',
      columna: 'Oportunidad/Administrador',
      propia: formatoMonto(c.monto_directa),
      equipo: formatoMonto(c.monto_equipo),
      multiplica: CUMPLIMIENTO,
    },
    {
      cargo: 'coord_oficina',
      columna: 'Vendedor',
      propia: formatoMonto(c.monto_directa),
      equipo: formatoMonto(c.monto_equipo),
      multiplica: CUMPLIMIENTO,
    },
    {
      cargo: 'coord_un',
      columna: 'la de cada supervisor',
      propia: formatoMonto(c.monto_directa_un),
      equipo: <>{entre(c.tramos_un.map((t) => t.monto))} <span className="text-slate-500">· según crecimiento</span></>,
      multiplica: <span className="text-slate-500">Nada (sin objetivo)</span>,
    },
  ];

  return (
    <NeonContainer
      title="Quién cobra qué"
      subtitle="Lo que cobra cada cargo por cada venta válida del periodo"
      icon={<LayoutGrid className="h-5 w-5" />}
      theme="slate"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm text-slate-300">
          <thead>
            <tr className={CABECERA}>
              <th className="py-2 pr-3 text-left">Cargo</th>
              <th className="px-3 py-2 text-left">Venta residencial propia</th>
              <th className="px-3 py-2 text-left">Venta residencial de su equipo</th>
              <th className="px-3 py-2 text-left">Venta PYME propia</th>
              <th className="px-3 py-2 text-left">El total se multiplica por</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.cargo} className="border-t border-slate-800/60">
                <td className="py-3 pr-3">
                  <ChipCargo cargo={f.cargo} />
                  <div className="mt-1 text-[11px] text-slate-500">lo nombra {f.columna}</div>
                </td>
                <td className="px-3 py-3 font-semibold text-white">{f.propia}</td>
                <td className="px-3 py-3 font-semibold text-white">{f.equipo}</td>
                <td className="px-3 py-3 font-semibold text-amber-400">% del plan</td>
                <td className="px-3 py-3">{f.multiplica}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Nota icon={<Info className="text-sky-400" />}>
          Una venta propia no cuenta además como venta de equipo: el supervisor cobra{' '}
          <strong className="text-white">{formatoMonto(c.monto_directa)}</strong>, no{' '}
          {formatoMonto(c.monto_directa + c.monto_equipo)}.
        </Nota>
        <Nota icon={<Info className="text-amber-400" />}>
          PYME paga solo a quien la vendió y no cuenta para ningún tramo ni equipo.
        </Nota>
        <Nota icon={<Info className="text-emerald-400" />}>
          El % de cumplimiento no se configura aquí: se escribe en el informe de cada periodo, en el paso de indicadores.
        </Nota>
      </div>
    </NeonContainer>
  );
}

const PASOS: { cargo: CargoVentas; columna: string; regla: (c: CondicionesComision) => string }[] = [
  { cargo: 'asesor', columna: 'Medio', regla: () => 'Suma una venta para su tramo del mes' },
  { cargo: 'supervisor', columna: 'Oportunidad/Administrador', regla: (c) => `${formatoMonto(c.monto_equipo)} × su % de cumplimiento` },
  { cargo: 'coord_oficina', columna: 'Vendedor', regla: (c) => `${formatoMonto(c.monto_equipo)} × su % de cumplimiento` },
  {
    cargo: 'coord_un',
    columna: 'La del supervisor',
    regla: (c) => `${entre(c.tramos_un.map((t) => t.monto))} según el crecimiento de sus unidades`,
  },
];

export function RecorridoVenta({ condiciones }: { condiciones: CondicionesComision }) {
  return (
    <NeonContainer
      title="Una venta residencial, quién cobra"
      subtitle="Cada columna de la venta nombra a alguien, y cada uno cobra por la regla de su cargo"
      icon={<Route className="h-5 w-5" />}
      theme="cyan"
    >
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PASOS.map((paso, i) => (
          <li key={paso.cargo} className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              {i + 1} · {paso.columna}
            </span>
            <ChipCargo cargo={paso.cargo} />
            <span className="text-xs text-slate-300">{paso.regla(condiciones)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-400">
        Si una persona aparece en dos columnas de la misma venta cobra una sola vez: quien la vendió, como venta propia;
        los demás, como venta de equipo. Una venta sin Vendedor no le paga a ninguna oficina.
      </p>
    </NeonContainer>
  );
}
