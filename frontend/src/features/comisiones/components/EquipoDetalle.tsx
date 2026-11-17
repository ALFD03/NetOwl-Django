/** Comisiones › Nómina: un equipo de ventas con sus roles de dirección, sus supervisores y los asesores de cada uno. */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pencil } from 'lucide-react';

import { aBs, formatoBs, formatoMonto, formatoPct, origenCumplimiento, totalBs } from '../lib/formato';
import {
  clavePago, motivoRecorte, notasBono, rangoTramo, siguienteTramo, tramoAsesor, ventasPagadas, ventasValidadas,
  type EquipoNomina, type GrupoSupervisor, type Nomina,
} from '../lib/nomina';
import type { CondicionesComision, PagoComision } from '../types';
import { BarraCrecimiento, BarraTramo, ChipRol, Kpi, Medidor, VentasCelda } from './piezas';

/** Las columnas de las filas de personas: nombre, indicador, ventas, $ y Bs. */
export const COLUMNAS_PERSONA = 'grid grid-cols-[minmax(220px,1fr)_220px_104px_128px_168px] items-center gap-x-4';
const NUM = 'text-right font-mono tabular-nums';

export interface DetalleProps {
  condiciones: CondicionesComision;
  tasa: number | null;
  /** Pago encontrado con el buscador (`clavePago`): su fila se marca. */
  resaltado: string | null;
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

/** Las condiciones de un pago: las del rol en su equipo. */
const tramosDe = (p: PagoComision, condiciones: CondicionesComision) =>
  condiciones.equipos?.[p.equipo]?.[p.rol]?.tramos_asesor;

/** Lo que va bajo un nombre: por qué cobra menos, sus bonos y si tiene ventas con otro supervisor. */
function Notas({ p, nomina, condiciones }: { p: PagoComision; nomina: Nomina; condiciones: CondicionesComision }) {
  const motivo = motivoRecorte(p, tramosDe(p, condiciones));
  const bonos = notasBono(p);
  const fuera = nomina.fuera.get(clavePago(p));
  if (!motivo && !bonos.length && !fuera && !p.avisos.length) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
      {motivo && <span className={p.neto === 0 ? 'text-slate-400' : ''}>{motivo}</span>}
      {bonos.map((b) => <span key={b} className="font-semibold text-amber-400">{b}</span>)}
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

/** El tramo de quien cobra por tramos, con la barra y lo que le falta para el siguiente. */
function IndicadorTramos({ p, condiciones }: { p: PagoComision; condiciones: CondicionesComision }) {
  const tramos = tramosDe(p, condiciones);
  if (!tramos?.length) return <span />;
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

/** Lo que mide a cada rol, en la columna central de su fila. */
function Indicador({ p, condiciones, onEditarIndicadores }: { p: PagoComision; condiciones: CondicionesComision; onEditarIndicadores: (() => void) | null }) {
  if (p.detalle.ventas_pagadas !== undefined) return <IndicadorTramos p={p} condiciones={condiciones} />;

  if (p.rol === 'coord_un') {
    const escalon = condiciones.equipos?.[p.equipo]?.[p.rol]?.escalon_crecimiento;
    const porVenta = p.detalle.monto_por_venta_equipo ?? 0;
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          {p.crecimiento_pct === null ? (
            <span className="text-xs font-bold text-amber-400">Crecimiento desconocido</span>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-bold tabular-nums text-violet-300">{formatoPct(p.crecimiento_pct)}</span>
                <span className="truncate text-[10px] text-slate-500">
                  {p.crecimiento_fuente === 'manual' ? 'a mano' : 'crecimiento'} → {formatoMonto(porVenta)}/venta
                </span>
              </div>
              <BarraCrecimiento pct={p.crecimiento_pct} cortes={escalon ? [escalon.umbral_pct] : []} />
            </>
          )}
        </div>
        <EditarIndicador onClick={onEditarIndicadores} />
      </div>
    );
  }

  if (p.detalle.factor) {
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1"><Medidor pct={p.factor_pct} nota={origenCumplimiento(p)} /></div>
        <EditarIndicador onClick={onEditarIndicadores} />
      </div>
    );
  }
  if (p.rol === 'administradora') {
    return <span className="text-xs text-slate-300">Empresa al {formatoPct(p.detalle.pct_empresa ?? null)}</span>;
  }
  return <span />;
}

/** Lo que va bajo el nombre de quien dirige: cuántas ventas y de qué. */
function Resumen({ p }: { p: PagoComision }) {
  const partes = [
    p.ventas_propias ? `${p.ventas_propias} propias` : '',
    p.ventas_equipo ? `${p.ventas_equipo} de su equipo` : '',
    p.detalle.asesores ? `${p.detalle.asesores} ${p.detalle.asesores === 1 ? 'asesor' : 'asesores'}` : '',
    p.unidades.length ? p.unidades.join(', ') : '',
    p.site ? `site ${p.site}` : '',
  ].filter(Boolean);
  return partes.length ? <div className="mt-0.5 text-[11px] text-slate-500">{partes.join(' · ')}</div> : null;
}

function FilaPersona({
  p, nomina, sangria = false, destacada = false, ...props
}: DetalleProps & { p: PagoComision; nomina: Nomina; sangria?: boolean; destacada?: boolean }) {
  const resaltar = props.resaltado === clavePago(p);
  return (
    <div
      id={`persona-${clavePago(p)}`}
      className={`${COLUMNAS_PERSONA} px-4 py-2.5 transition ${destacada ? 'bg-surface-primary/70' : 'border-t border-slate-800/60'} ${
        resaltar ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40' : 'hover:bg-slate-800/30'
      } ${p.neto === 0 ? 'opacity-60' : ''}`}
    >
      <div className={`min-w-0 ${sangria ? 'pl-4' : ''}`}>
        <div className="flex min-w-0 items-center gap-2">
          <Nombre p={p} onVerPersona={props.onVerPersona} />
          {p.rol !== 'asesor' && <ChipRol rol={p.rol} />}
        </div>
        {!sangria && <Resumen p={p} />}
        <Notas p={p} nomina={nomina} condiciones={props.condiciones} />
      </div>
      <Indicador p={p} condiciones={props.condiciones} onEditarIndicadores={props.onEditarIndicadores} />
      <div className="text-right"><VentasCelda validadas={ventasValidadas(p)} pagadas={ventasPagadas(p)} /></div>
      <span className={`${NUM} flex flex-col text-sm font-bold text-white`}>
        {formatoMonto(p.neto)}
        {p.factor_pct !== null && p.factor_pct < 100 && <span className="text-[10px] font-normal text-slate-500">de {formatoMonto(p.bruto)}</span>}
      </span>
      <span className={`${NUM} text-sm font-bold text-emerald-300`}>{formatoBs(aBs(p.neto, props.tasa))}</span>
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

function Grupo({
  g, nomina, abierto, onToggle, ...props
}: DetalleProps & { g: GrupoSupervisor; nomina: Nomina; abierto: boolean; onToggle: () => void }) {
  const totalUsd = Math.round(g.asesores.reduce((t, a) => t + a.neto, 0) * 100) / 100;
  const personas = `${g.asesores.length} ${g.asesores.length === 1 ? (g.pago ? 'asesor' : 'persona') : (g.pago ? 'asesores' : 'personas')}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/40">
      {g.pago && <FilaPersona p={g.pago} nomina={nomina} destacada {...props} />}
      <Plegador
        abierto={abierto}
        onToggle={onToggle}
        tono={g.pago ? 'suave' : 'normal'}
        derecha={<span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">{formatoMonto(totalUsd)}</span>}
      >
        {g.pago ? (
          <span className="text-[11px] text-slate-400">{abierto ? 'Ocultar' : 'Mostrar'} {personas}</span>
        ) : (
          <>
            <span className="truncate text-sm font-bold text-slate-200">{g.nombre}</span>
            <span className="shrink-0 text-[11px] text-slate-500">{personas}</span>
          </>
        )}
      </Plegador>
      {abierto && g.asesores.map((a) => <FilaPersona key={clavePago(a)} p={a} nomina={nomina} sangria {...props} />)}
    </div>
  );
}

/** El detalle de un equipo: sus cifras, los roles de dirección y cada grupo de supervisor. */
export function EquipoDetalle({ equipo, nomina, ...props }: DetalleProps & { equipo: EquipoNomina; nomina: Nomina }) {
  // Lo plegado: `kpi`, `sec:<rol>` y `grp:<supervisor>`. Todo empieza abierto, y el equipo se
  // remonta al cambiar (`key` en la nómina), así que cada uno recuerda lo suyo solo mientras se mira.
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set());
  const alternar = (clave: string) =>
    setPlegados((antes) => {
      const siguiente = new Set(antes);
      if (!siguiente.delete(clave)) siguiente.add(clave);
      return siguiente;
    });
  const claves = [...equipo.secciones.map((s) => `sec:${s.rol}`), ...equipo.grupos.map((g) => `grp:${g.key}`)];
  const todoPlegado = claves.every((k) => plegados.has(k));

  // Quien se busca está dentro de un bloque plegado: se abre y se lleva a la vista. Se ajusta al
  // renderizar, al cambiar el buscado (no en un efecto), para no pintar antes el bloque cerrado.
  const { resaltado } = props;
  const [atendido, setAtendido] = useState<string | null>(null);
  if (resaltado !== atendido) {
    setAtendido(resaltado);
    if (resaltado !== null) {
      const dentro = [
        ...equipo.secciones.filter((s) => s.pagos.some((p) => clavePago(p) === resaltado)).map((s) => `sec:${s.rol}`),
        ...equipo.grupos.filter((g) => g.asesores.some((a) => clavePago(a) === resaltado)).map((g) => `grp:${g.key}`),
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

  const asesores = equipo.grupos.flatMap((g) => g.asesores);
  const validadasAsesores = asesores.reduce((t, p) => t + ventasValidadas(p), 0);
  const pagadasAsesores = asesores.reduce((t, p) => t + ventasPagadas(p), 0);
  const bonos = Math.round(equipo.personas.reduce((t, p) => t + p.bono, 0) * 100) / 100;
  const supervisores = equipo.grupos.filter((g) => g.pago).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="truncate text-xl font-black text-white">{equipo.nombre}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">
            {equipo.personas.length} {equipo.personas.length === 1 ? 'persona' : 'personas'}
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
            onClick={() => setPlegados(todoPlegado ? new Set(plegados.has('kpi') ? ['kpi'] : []) : new Set([...plegados, ...claves]))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800/60"
          >
            {todoPlegado ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
            {todoPlegado ? 'Expandir todo' : 'Contraer todo'}
          </button>
        </div>
      </div>

      {!plegados.has('kpi') && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Ventas validadas" nota="las del equipo">{equipo.ventas}</Kpi>
        <Kpi label="Pagadas a asesores" nota={validadasAsesores > pagadasAsesores ? `${validadasAsesores - pagadasAsesores} bajo tramo` : 'todas'}>
          <span className={pagadasAsesores < validadasAsesores ? 'text-amber-300' : ''}>{pagadasAsesores}</span>
          <span className="text-sm font-bold text-slate-500"> / {validadasAsesores}</span>
        </Kpi>
        <Kpi label="Bonos" tono="text-amber-300" nota="incluidos en lo que cobran">{formatoMonto(bonos)}</Kpi>
        <Kpi label="Equipo en $" nota="todo lo que cobran sus personas">{formatoMonto(equipo.usd)}</Kpi>
        <Kpi label="Equipo en Bs" tono="text-emerald-300" nota="a tasa CONATEL">
          <span className="text-lg text-emerald-300">{formatoBs(totalBs(equipo.personas.map((p) => p.neto), props.tasa))}</span>
        </Kpi>
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
          {equipo.secciones.map((s) => (
            <div key={s.rol} className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-primary/40">
              <Plegador
                abierto={!plegados.has(`sec:${s.rol}`)}
                onToggle={() => alternar(`sec:${s.rol}`)}
                derecha={<span className="shrink-0 font-mono text-xs tabular-nums text-slate-400">{formatoMonto(s.usd)}</span>}
              >
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">{s.etiqueta}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{s.pagos.length} {s.pagos.length === 1 ? 'persona' : 'personas'}</span>
              </Plegador>
              {!plegados.has(`sec:${s.rol}`) && s.pagos.map((p) => <FilaPersona key={clavePago(p)} p={p} nomina={nomina} {...props} />)}
            </div>
          ))}
          {equipo.grupos.map((g) => (
            <Grupo key={g.key} g={g} nomina={nomina} abierto={!plegados.has(`grp:${g.key}`)} onToggle={() => alternar(`grp:${g.key}`)} {...props} />
          ))}
        </div>
      </div>
    </div>
  );
}
