/** Comisiones › Nómina: una coordinación de oficina, que cobra aparte de las unidades de negocio. */

import { aBs, formatoBs, formatoMonto } from '../lib/formato';
import { motivoRecorte, ventasPagadas, ventasValidadas, type Oficina } from '../lib/nomina';
import { ChipCargo, Kpi, Medidor } from './piezas';
import { EditarIndicador, type DetalleProps } from './UnidadDetalle';

const TONOS = ['bg-violet-500/45', 'bg-violet-500/30', 'bg-violet-500/20', 'bg-violet-500/12'];

/**
 * Una oficina no es parte de ninguna unidad: cobra por las ventas que la nombran
 * como `Vendedor`, las haya cargado el supervisor que sea. Se enseña con qué
 * unidades comparte esas ventas, como reparto, sin meterla en ninguna.
 */
export function OficinaDetalle({ oficina, ...props }: DetalleProps & { oficina: Oficina }) {
  const p = oficina.pago;
  const repartidas = oficina.unidades.reduce((t, u) => t + u.ventas, 0);
  const motivo = motivoRecorte(p, props.condiciones);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ChipCargo cargo="coord_oficina" />
          <button
            type="button"
            onClick={() => props.onVerPersona(p)}
            title="Ver los clientes por los que cobra"
            className="truncate text-xl font-black text-white hover:text-sky-300 hover:underline"
          >
            {p.nombre}
          </button>
        </div>
        <span className="text-xs text-slate-500">
          {p.ventas_propias} propias · {p.ventas_equipo} con su Vendedor{p.ventas_pyme ? ` · ${p.ventas_pyme} PYME` : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Ventas validadas">{ventasValidadas(p)}</Kpi>
        <Kpi label="Ventas pagadas" nota="todas: el cumplimiento recorta el monto">{ventasPagadas(p)}</Kpi>
        <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-800 bg-surface-primary/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Cumplimiento</span>
            <EditarIndicador onClick={props.onEditarIndicadores} />
          </div>
          <Medidor pct={p.factor_pct} nota={p.cumplimiento_propio === null ? 'el general' : 'propio'} />
        </div>
        <Kpi label="A pagar $" nota={motivo ?? 'sin recorte'}>{formatoMonto(p.neto)}</Kpi>
        <Kpi label="A pagar Bs" tono="text-emerald-300" nota="a tasa CONATEL">
          <span className="text-lg text-emerald-300">{formatoBs(aBs(p.neto, props.tasa))}</span>
        </Kpi>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-800 bg-surface-primary/40 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Con qué unidades comparte sus ventas</p>
        {repartidas > 0 ? (
          <>
            <div className="flex h-8 overflow-hidden rounded-xl border border-slate-700">
              {oficina.unidades.map((u, i) => (
                <div
                  key={u.id ?? 'sin'}
                  title={`${u.nombre}: ${u.ventas} ventas`}
                  className={`flex min-w-0 items-center px-3 text-xs text-white ${u.id === null ? 'bg-amber-500/20' : TONOS[Math.min(i, TONOS.length - 1)]}`}
                  style={{ width: `${(u.ventas / repartidas) * 100}%` }}
                >
                  <span className="truncate">{u.nombre} · {u.ventas}</span>
                </div>
              ))}
            </div>
            <ul className="grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
              {oficina.unidades.map((u) => (
                <li key={u.id ?? 'sin'} className="flex justify-between gap-3 border-b border-slate-800/60 py-1">
                  <span className={u.id === null ? 'text-amber-300' : ''}>{u.nombre}</span>
                  <span className="font-mono tabular-nums text-slate-400">{u.ventas} ventas</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-slate-500">Este periodo no trae el reparto de ventas por unidad.</p>
        )}
        <p className="text-[11px] text-slate-500">
          La oficina no pertenece a estas unidades: las ventas con su Vendedor las cargaron supervisores de cada una.
        </p>
      </div>
    </div>
  );
}
