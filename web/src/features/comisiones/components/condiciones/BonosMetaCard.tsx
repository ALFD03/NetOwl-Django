/**
 * El bono por meta de los asesores: un monto único por estado según sus ventas
 * del mes, aparte de los tramos. En lectura, una tabla por estado; en edición,
 * los tramos de cada uno y los estados que se añaden o se quitan.
 */

import { useState } from 'react';
import { MapPin, Plus, Trophy } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Button, NeonContainer, SelectMenu } from '@/shared/ui';
import { ordenarTramosBono, rangoBono, type ErroresBonos } from '../../lib/condiciones';
import { formatoMonto } from '../../lib/formato';
import type { BonoMetaEstado, TramoBono } from '../../types';
import { Antes, BotonQuitar, CABECERA, CeldaNumero, ErrorFila, Nota } from './campos';

type Estado = { id: number; nombre: string };

function TablaBono({ bono }: { bono: BonoMetaEstado }) {
  const ordenados = ordenarTramosBono(bono.tramos);
  const primero = ordenados[0];
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <span className="flex items-center gap-2 text-sm font-bold text-white">
        <MapPin className="h-4 w-4 text-amber-400" aria-hidden />
        {bono.estado}
      </span>
      {ordenados.length ? (
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className={CABECERA}>
              <th className="py-2 pr-3 text-left">Ventas del mes</th>
              <th className="py-2 pl-3 text-right">Bono</th>
            </tr>
          </thead>
          <tbody>
            {primero.desde > 1 && (
              <tr className="border-t border-slate-800/60 text-slate-500">
                <td className="py-2 pr-3">Menos de {primero.desde}</td>
                <td className="py-2 pl-3 text-right">Sin bono</td>
              </tr>
            )}
            {ordenados.map((t) => (
              <tr key={t.desde} className="border-t border-slate-800/60">
                <td className="py-2 pr-3 font-semibold text-white">{rangoBono(t, ordenados)}</td>
                <td className="py-2 pl-3 text-right font-mono font-bold tabular-nums text-amber-300">{formatoMonto(t.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <span className="text-xs text-slate-500">Sin tramos: no paga bono.</span>
      )}
    </div>
  );
}

function EdicionBono({
  bono, guardado, errores, onChange, onQuitar,
}: {
  bono: BonoMetaEstado;
  guardado: BonoMetaEstado | undefined;
  errores: Map<number, string> | undefined;
  onChange: (tramos: TramoBono[]) => void;
  onQuitar: () => void;
}) {
  const previos = new Map((guardado?.tramos ?? []).map((t) => [t.desde, t]));
  const validos = ordenarTramosBono(bono.tramos.filter((_, i) => !errores?.has(i)));
  const cambiar = (i: number, patch: Partial<TramoBono>) =>
    onChange(bono.tramos.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const agregar = () => {
    const inicios = bono.tramos.map((t) => t.desde).filter(Number.isFinite);
    onChange([...bono.tramos, { desde: inicios.length ? Math.max(...inicios) + 10 : 15, monto: 0 }]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <MapPin className="h-4 w-4 text-amber-400" aria-hidden />
          {bono.estado}
          {!guardado && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">nuevo</span>}
        </span>
        <BotonQuitar label={`Quitar el bono de ${bono.estado}`} onClick={onQuitar} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-xs text-slate-300">
          <thead>
            <tr className={CABECERA}>
              <th className="py-2 pr-2 text-left">Desde (ventas)</th>
              <th className="px-2 py-2 text-left">Rango</th>
              <th className="px-2 py-2 text-left">Bono</th>
              <th className="py-2"><span className="sr-only">Quitar</span></th>
            </tr>
          </thead>
          {bono.tramos.map((t, i) => {
            const previo = Number.isFinite(t.desde) ? previos.get(t.desde) : undefined;
            const error = errores?.get(i);
            const n = i + 1;
            return (
              <tbody key={i} className={cn('border-t border-slate-800/60', error && 'bg-rose-500/5')}>
                <tr>
                  <td className="py-2 pr-2 align-top">
                    <CeldaNumero label={`Desde, tramo ${n} de ${bono.estado}`} min={1} value={t.desde} error={Boolean(error)} onChange={(v) => cambiar(i, { desde: v ?? NaN })} />
                  </td>
                  <td className="px-2 py-2 align-top leading-9">
                    {validos.includes(t) ? <span className="font-semibold text-white">{rangoBono(t, validos)}</span> : <span className="text-rose-400">—</span>}
                    {guardado && !previo && !error && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">nuevo</span>}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <CeldaNumero
                      label={`Bono, tramo ${n} de ${bono.estado}`}
                      min={0}
                      value={t.monto}
                      cambiado={Boolean(previo) && previo?.monto !== t.monto}
                      onChange={(v) => cambiar(i, { monto: v ?? NaN })}
                    />
                    <Antes valor={previo && previo.monto !== t.monto ? formatoMonto(previo.monto) : null} />
                  </td>
                  <td className="py-2 text-right align-top">
                    <BotonQuitar label={`Quitar tramo ${n} de ${bono.estado}`} onClick={() => onChange(bono.tramos.filter((_, j) => j !== i))} />
                  </td>
                </tr>
                {error && (
                  <tr>
                    <td colSpan={4} className="pb-2"><ErrorFila>{error}</ErrorFila></td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={agregar} className="self-start">
        Añadir tramo
      </Button>
    </div>
  );
}

export function BonosMetaCard({
  bonos, guardados, estados, editando, errores, onChange,
}: {
  bonos: BonoMetaEstado[];
  guardados: BonoMetaEstado[];
  estados: Estado[];
  editando: boolean;
  errores: ErroresBonos;
  onChange: (bonos: BonoMetaEstado[]) => void;
}) {
  const [nuevo, setNuevo] = useState('');
  const previos = new Map(guardados.map((b) => [b.estado_id, b]));
  const libres = estados.filter((e) => !bonos.some((b) => b.estado_id === e.id));
  const sinBono = libres.map((e) => e.nombre);

  const agregarEstado = () => {
    const estado = estados.find((e) => String(e.id) === nuevo);
    if (!estado) return;
    onChange([...bonos, { estado_id: estado.id, estado: estado.nombre, tramos: [{ desde: 15, monto: 0 }] }]);
    setNuevo('');
  };

  return (
    <NeonContainer
      title="Bono por meta de los asesores"
      subtitle={editando
        ? 'Cada tramo vale desde su inicio hasta el siguiente; por debajo del primero no hay bono'
        : 'Un monto único según las ventas residenciales válidas del mes y el estado en que vende'}
      icon={<Trophy className="h-5 w-5" />}
      theme="yellow"
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {bonos.map((b) =>
            editando ? (
              <EdicionBono
                key={b.estado_id}
                bono={b}
                guardado={previos.get(b.estado_id)}
                errores={errores.filas.get(b.estado_id)}
                onChange={(tramos) => onChange(bonos.map((x) => (x.estado_id === b.estado_id ? { ...x, tramos } : x)))}
                onQuitar={() => onChange(bonos.filter((x) => x.estado_id !== b.estado_id))}
              />
            ) : (
              <TablaBono key={b.estado_id} bono={b} />
            ),
          )}
          {!bonos.length && <p className="text-sm text-slate-400">Ningún estado tiene bono por meta.</p>}
        </div>

        {editando && libres.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <SelectMenu
              aria-label="Estado al que dar un bono"
              value={nuevo}
              placeholder="Estado sin bono…"
              options={libres.map((e) => ({ value: String(e.id), label: e.nombre }))}
              onChange={setNuevo}
              className="w-56"
            />
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={agregarEstado} disabled={!nuevo}>
              Dar bono a este estado
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Nota icon={<MapPin className="text-amber-400" />}>
            El estado de cada asesor es el de la zona donde tiene más clientes, salvo que se le fije uno en Catálogos ›
            Ventas.{sinBono.length > 0 && <> Sin bono: {sinBono.join(', ')}.</>}
          </Nota>
          <Nota icon={<Trophy className="text-amber-400" />}>
            Se suma a lo que cobra por su tramo y cuenta las mismas ventas: las residenciales válidas, sin PYME.
          </Nota>
        </div>
      </div>
    </NeonContainer>
  );
}
