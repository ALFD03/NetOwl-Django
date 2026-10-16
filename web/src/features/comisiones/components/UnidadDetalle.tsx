/** Comisiones › Nómina: una unidad de negocio con su coordinador, sus supervisores y los asesores de cada uno. */

import { AlertTriangle, Pencil } from 'lucide-react';

import { aBs, formatoBs, formatoMonto, formatoPct, totalBs } from '../lib/formato';
import {
  cortesCrecimiento, motivoRecorte, rangoTramo, siguienteTramo, tramoAsesor, ventasPagadas, ventasValidadas,
  type GrupoSupervisor, type Nomina, type Unidad,
} from '../lib/nomina';
import type { CondicionesComision, PagoComision } from '../types';
import { BarraCrecimiento, BarraTramo, ChipCargo, Kpi, Medidor, VentasCelda } from './piezas';

/** Las columnas de las filas de personas: nombre, indicador, ventas, $ y Bs. */
export const COLUMNAS_PERSONA = 'grid grid-cols-[minmax(220px,1fr)_220px_104px_128px_168px] items-center gap-x-4';
const NUM = 'text-right font-mono tabular-nums';

export interface DetalleProps {
  condiciones: CondicionesComision;
  tasa: number | null;
  /** Persona encontrada con el buscador: su fila se marca. */
  resaltado: number | null;
  onVerPersona: (pago: PagoComision) => void;
  /** Lleva al paso de indicadores; nulo si no se puede editar. */
  onEditarIndicadores: (() => void) | null;
}

/** El botón discreto que lleva a donde se escribe un %: la nómina no edita nada. */
export function EditarIndicador({ onClick }: { onClick: (() => void) | null }) {
  if (!onClick) return null;
  return (
    <button type="button" onClick={onClick} title="Editar en Indicadores" className="rounded p-1 text-slate-500 hover:bg-sky-500/10 hover:text-sky-300">
      <Pencil className="h-3 w-3" />
    </button>
  );
}

/** Lo que va bajo un nombre: por qué cobra menos y si tiene ventas en otro equipo. */
function Notas({ p, nomina, condiciones }: { p: PagoComision; nomina: Nomina; condiciones: CondicionesComision }) {
  const motivo = motivoRecorte(p, condiciones);
  const fuera = nomina.fuera.get(p.persona_id);
  if (!motivo && !fuera && !p.avisos.length) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
      {motivo && <span className={p.neto === 0 ? 'text-slate-400' : ''}>{motivo}</span>}
      {fuera && <span>+{fuera.ventas} con {fuera.donde} (incluidas)</span>}
      {p.avisos.length > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-400" title={p.avisos.join('\n')}>
          <AlertTriangle className="h-3 w-3" />
          {p.avisos.length === 1 ? 'Un aviso' : `${p.avisos.length} avisos`}
        </span>
      )}
    </div>
  );
}

function Nombre({ p, onVerPersona }: { p: PagoComision; onVerPersona: (pago: PagoComision) => void }) {
  return (
    <button
      type="button"
      onClick={() => onVerPersona(p)}
      title="Ver los clientes por los que cobra"
      className="truncate text-left text-sm font-semibold text-white hover:text-sky-300 hover:underline"
    >
      {p.nombre}
    </button>
  );
}

/** El tramo de un asesor, con la barra y lo que le falta para el siguiente. */
function IndicadorAsesor({ p, condiciones }: { p: PagoComision; condiciones: CondicionesComision }) {
  const tramos = condiciones.tramos_asesor;
  const tramo = tramoAsesor(p.ventas_propias, tramos);
  const siguiente = siguienteTramo(p.ventas_propias, tramos);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={tramo.monto > 0 ? 'font-semibold text-slate-200' : 'text-slate-500'}>
          {tramo.monto > 0 ? `Tramo ${rangoTramo(tramo, tramos)} · ${formatoMonto(tramo.monto)}` : 'Sin tramo'}
        </span>
        <span className="truncate text-[10px] text-slate-500">
          {siguiente ? `faltan ${siguiente.desde - p.ventas_propias} para ${formatoMonto(siguiente.monto)}` : 'tramo máximo'}
        </span>
      </div>
      <BarraTramo ventas={p.ventas_propias} tramos={tramos} />
    </div>
  );
}

function FilaAsesor({ p, nomina, ...props }: DetalleProps & { p: PagoComision; nomina: Nomina }) {
  const resaltar = props.resaltado === p.persona_id;
  return (
    <div
      id={`persona-${p.persona_id}`}
      className={`${COLUMNAS_PERSONA} border-t border-slate-800/60 px-4 py-2.5 transition ${
        resaltar ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40' : 'hover:bg-slate-800/30'
      } ${p.neto === 0 ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0 pl-4">
        <div className="flex min-w-0 items-center gap-2">
          <Nombre p={p} onVerPersona={props.onVerPersona} />
          {p.cargo !== 'asesor' && <ChipCargo cargo={p.cargo} />}
        </div>
        <Notas p={p} nomina={nomina} condiciones={props.condiciones} />
      </div>
      {p.cargo === 'asesor' ? <IndicadorAsesor p={p} condiciones={props.condiciones} /> : <span />}
      <div className="text-right"><VentasCelda validadas={ventasValidadas(p)} pagadas={ventasPagadas(p)} /></div>
      <span className={`${NUM} text-sm font-bold text-white`}>{formatoMonto(p.neto)}</span>
      <span className={`${NUM} text-sm font-bold text-emerald-300`}>{formatoBs(aBs(p.neto, props.tasa))}</span>
    </div>
  );
}

const QUIEN_SUPERVISA: Record<GrupoSupervisor['supervisa'], string> = {
  supervisor: '',
  coord_un: 'Supervisados por la coordinación de la unidad',
  coord_oficina: 'Supervisados por una coordinación de oficina',
  nadie: 'Sin supervisor en la venta',
};

function Grupo({ g, nomina, ...props }: DetalleProps & { g: GrupoSupervisor; nomina: Nomina }) {
  const s = g.pago;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/40">
      {s ? (
        <div
          id={`persona-${s.persona_id}`}
          className={`${COLUMNAS_PERSONA} border-b border-slate-800 px-4 py-3 ${
            props.resaltado === s.persona_id ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40' : 'bg-surface-primary/70'
          } ${s.neto === 0 ? 'opacity-60' : ''}`}
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Nombre p={s} onVerPersona={props.onVerPersona} />
              <ChipCargo cargo="supervisor" />
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {s.ventas_propias} propias · {s.ventas_equipo} de su equipo · {g.asesores.length} {g.asesores.length === 1 ? 'asesor' : 'asesores'}
            </div>
            <Notas p={s} nomina={nomina} condiciones={props.condiciones} />
          </div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <Medidor pct={s.factor_pct} nota={s.cumplimiento_propio === null ? 'cumplimiento general' : 'cumplimiento propio'} />
            </div>
            <EditarIndicador onClick={props.onEditarIndicadores} />
          </div>
          <div className="text-right"><VentasCelda validadas={ventasValidadas(s)} pagadas={ventasPagadas(s)} /></div>
          <span className={`${NUM} flex flex-col text-sm font-black text-white`}>
            {formatoMonto(s.neto)}
            {s.factor_pct !== null && s.factor_pct < 100 && <span className="text-[10px] font-normal text-slate-500">de {formatoMonto(s.bruto)}</span>}
          </span>
          <span className={`${NUM} text-sm font-black text-emerald-300`}>{formatoBs(aBs(s.neto, props.tasa))}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800 bg-surface-primary/70 px-4 py-2.5">
          <span className="text-sm font-bold text-slate-200">
            {g.id === null ? QUIEN_SUPERVISA.nadie : g.nombre}
            {g.id !== null && <span className="ml-2 text-[11px] font-normal text-slate-500">{QUIEN_SUPERVISA[g.supervisa]}</span>}
          </span>
          <span className="text-[11px] text-slate-500">{g.asesores.length} {g.asesores.length === 1 ? 'persona' : 'personas'}</span>
        </div>
      )}
      {g.asesores.map((a) => <FilaAsesor key={a.persona_id} p={a} nomina={nomina} {...props} />)}
    </div>
  );
}

/** Lo que cobra el coordinador de la unidad, explicado. */
function Coordinador({ p, nomina, ...props }: DetalleProps & { p: PagoComision; nomina: Nomina }) {
  const porVenta = p.detalle.monto_por_venta_equipo ?? 0;
  return (
    <div
      id={`persona-${p.persona_id}`}
      className={`${COLUMNAS_PERSONA} rounded-2xl border border-violet-500/25 px-4 py-3 ${
        props.resaltado === p.persona_id ? 'bg-sky-500/10 ring-1 ring-sky-500/40' : 'bg-violet-500/[0.05]'
      } ${p.neto === 0 ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Nombre p={p} onVerPersona={props.onVerPersona} />
          <ChipCargo cargo="coord_un" />
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {p.ventas_equipo} del equipo × {formatoMonto(porVenta)} + {p.ventas_propias} propias × {formatoMonto(props.condiciones.monto_directa_un)}
        </div>
        <Notas p={p} nomina={nomina} condiciones={props.condiciones} />
      </div>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          {p.crecimiento_pct === null ? (
            <span className="text-xs font-bold text-amber-400">Crecimiento desconocido</span>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-bold tabular-nums text-violet-300">{formatoPct(p.crecimiento_pct)}</span>
                <span className="truncate text-[10px] text-slate-500">
                  {p.crecimiento_fuente === 'manual' ? 'escrito a mano' : 'crecimiento'} → {formatoMonto(porVenta)}/venta
                </span>
              </div>
              <BarraCrecimiento pct={p.crecimiento_pct} cortes={cortesCrecimiento(props.condiciones.tramos_un)} />
            </>
          )}
        </div>
        <EditarIndicador onClick={props.onEditarIndicadores} />
      </div>
      <div className="text-right"><VentasCelda validadas={ventasValidadas(p)} pagadas={ventasPagadas(p)} /></div>
      <span className={`${NUM} text-sm font-black text-white`}>{formatoMonto(p.neto)}</span>
      <span className={`${NUM} text-sm font-black text-emerald-300`}>{formatoBs(aBs(p.neto, props.tasa))}</span>
    </div>
  );
}

/** El detalle de una unidad: sus cifras, lo que cobra el coordinador y cada equipo de supervisor. */
export function UnidadDetalle({ unidad, nomina, ...props }: DetalleProps & { unidad: Unidad; nomina: Nomina }) {
  const asesores = unidad.grupos.flatMap((g) => g.asesores);
  const validadasAsesores = asesores.reduce((t, p) => t + ventasValidadas(p), 0);
  const pagadasAsesores = asesores.reduce((t, p) => t + ventasPagadas(p), 0);
  const supervisores = unidad.grupos.filter((g) => g.pago).length;
  const coord = unidad.coordinador;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {unidad.id !== null ? <ChipCargo cargo="coord_un">Unidad de negocio</ChipCargo> : (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">Sin unidad</span>
          )}
          <h3 className="truncate text-xl font-black text-white">{unidad.nombre}</h3>
        </div>
        <span className="text-xs text-slate-500">
          {unidad.personas.length} {unidad.personas.length === 1 ? 'persona' : 'personas'} · {supervisores} {supervisores === 1 ? 'supervisor' : 'supervisores'}
        </span>
      </div>

      {unidad.id === null && (
        <p className="text-xs text-slate-400">
          Ventas cuyo supervisor no tiene coordinador de UN asignado en Comisiones › Supervisores, o que no traen supervisor.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Ventas validadas" nota="las que pasaron por la unidad">{unidad.ventas}</Kpi>
        <Kpi label="Pagadas a asesores" nota={validadasAsesores > pagadasAsesores ? `${validadasAsesores - pagadasAsesores} bajo tramo` : 'todas'}>
          <span className={pagadasAsesores < validadasAsesores ? 'text-amber-300' : ''}>{pagadasAsesores}</span>
          <span className="text-sm font-bold text-slate-500"> / {validadasAsesores}</span>
        </Kpi>
        <Kpi
          label="Crecimiento"
          tono="text-violet-300"
          nota={coord?.crecimiento_pct != null ? `→ ${formatoMonto(coord.detalle.monto_por_venta_equipo ?? 0)} por venta del equipo` : unidad.id === null ? 'no aplica' : 'sin conocer'}
        >
          {coord?.crecimiento_pct != null ? <span className="text-violet-300">{formatoPct(coord.crecimiento_pct)}</span> : <span className="text-slate-500">—</span>}
        </Kpi>
        <Kpi label="Unidad en $" nota="todo lo que cobran sus personas">{formatoMonto(unidad.usd)}</Kpi>
        <Kpi label="Unidad en Bs" tono="text-emerald-300" nota="a tasa CONATEL">
          <span className="text-lg text-emerald-300">{formatoBs(totalBs(unidad.personas.map((p) => p.neto), props.tasa))}</span>
        </Kpi>
      </div>

      {unidad.oficinas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="font-bold uppercase tracking-wider">Comparte ventas con</span>
          {unidad.oficinas.map((o) => (
            <span key={o.id} className="rounded-full border border-dashed border-sky-500/40 px-2 py-0.5 text-sky-300">
              {o.nombre} · {o.ventas}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[860px] space-y-3">
          <div className={`${COLUMNAS_PERSONA} px-4 text-[10px] font-black uppercase tracking-wider text-slate-400`}>
            <span>Persona</span>
            <span>Cumplimiento · crecimiento · tramo</span>
            <span className="text-right">Pagadas / valid.</span>
            <span className="text-right">A pagar $</span>
            <span className="text-right">A pagar Bs · CONATEL</span>
          </div>
          {coord && <Coordinador p={coord} nomina={nomina} {...props} />}
          {unidad.grupos.map((g) => <Grupo key={g.key} g={g} nomina={nomina} {...props} />)}
        </div>
      </div>
    </div>
  );
}
