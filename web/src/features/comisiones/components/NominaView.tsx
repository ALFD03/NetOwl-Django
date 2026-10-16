/** Comisiones › Informe › Nómina: unidad por unidad, y las oficinas aparte. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Network, Search, X } from 'lucide-react';

import { formatoBs, formatoMonto, formatoPct, totalBs } from '../lib/formato';
import { armarNomina } from '../lib/nomina';
import type { InformeComision } from '../types';
import { CARGO_CHIP } from './piezas';
import { OficinaDetalle } from './OficinaDetalle';
import { UnidadDetalle, type DetalleProps } from './UnidadDetalle';

interface NominaViewProps extends Omit<DetalleProps, 'resaltado'> {
  informe: InformeComision;
}

/**
 * La nómina del periodo, de solo lectura: a la izquierda las unidades de
 * negocio y las oficinas con lo que cobra cada una, a la derecha la elegida.
 * Los % se escriben en el paso de Indicadores, nunca aquí.
 *
 * Cada persona sale una sola vez (ver `lib/nomina`), así que la suma de la
 * lista es el total a pagar.
 */
export function NominaView({ informe, ...props }: NominaViewProps) {
  const nomina = useMemo(() => armarNomina(informe), [informe]);
  const primera = nomina.unidades[0] ? `u:${nomina.unidades[0].key}` : nomina.oficinas[0] ? `o:${nomina.oficinas[0].pago.persona_id}` : '';
  const [elegida, setElegida] = useState(primera);
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState<number | null>(null);
  const detalleRef = useRef<HTMLDivElement>(null);
  const subir = useRef(false);

  // Al cambiar de periodo, lo elegido puede no existir.
  const existe = nomina.unidades.some((u) => `u:${u.key}` === elegida) || nomina.oficinas.some((o) => `o:${o.pago.persona_id}` === elegida);
  const actual = existe ? elegida : primera;

  // La lista es larga: lo elegido abajo no debe abrirse fuera de la vista. Va
  // tras pintar, porque el detalle nuevo puede ser más corto que el anterior.
  useEffect(() => {
    if (!subir.current) return;
    subir.current = false;
    const caja = detalleRef.current;
    // 150 px: la barra del periodo queda fija encima y tapa lo que llega a ese alto.
    if (caja && caja.getBoundingClientRect().top < 150) caja.scrollIntoView({ block: 'start' });
  }, [actual]);

  useEffect(() => {
    if (resaltado === null) return;
    document.getElementById(`persona-${resaltado}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [resaltado, actual]);

  const texto = busqueda.trim().toLowerCase();
  const encontrados = texto ? informe.pagos.filter((p) => p.nombre.toLowerCase().includes(texto)).slice(0, 12) : [];

  const ir = (personaId: number) => {
    const donde = nomina.ubicacion.get(personaId);
    if (!donde) return;
    setElegida(donde === 'oficinas' ? `o:${personaId}` : `u:${donde}`);
    setResaltado(personaId);
    setBusqueda('');
  };

  if (informe.pagos.length === 0) {
    return <p className="p-10 text-center text-sm text-slate-500">Nadie cobra en este periodo.</p>;
  }

  const unidad = nomina.unidades.find((u) => `u:${u.key}` === actual);
  const oficina = nomina.oficinas.find((o) => `o:${o.pago.persona_id}` === actual);
  const totalUsd = Math.round(informe.pagos.reduce((t, p) => t + p.neto, 0) * 100) / 100;
  const elegir = (key: string) => {
    setElegida(key);
    setResaltado(null);
    subir.current = true;
  };

  const item = (key: string, titulo: string, linea: string, usd: number, aviso = false) => (
    <button
      key={key}
      type="button"
      onClick={() => elegir(key)}
      aria-current={actual === key}
      className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition ${
        actual === key ? 'border-sky-500/40 bg-surface-tertiary' : 'border-transparent hover:bg-surface-secondary'
      }`}
    >
      <span className={`truncate text-sm font-bold ${aviso ? 'text-amber-300' : 'text-white'}`}>{titulo}</span>
      <span className="flex justify-between gap-2 text-[11px] text-slate-400">
        <span className="truncate">{linea}</span>
        <span className="shrink-0 font-mono tabular-nums text-slate-300">{formatoMonto(usd)}</span>
      </span>
    </button>
  );

  return (
    <div ref={detalleRef} className="grid scroll-mt-40 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-1 border-b border-slate-800 bg-surface-primary/40 p-3 lg:sticky lg:top-36 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="relative mb-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-surface-primary px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar persona..."
              aria-label="Buscar persona"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar" className="text-slate-500 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
          {texto && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-700 bg-surface-secondary p-1 shadow-xl">
              {encontrados.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Nadie coincide.</p>}
              {encontrados.map((p) => (
                <button
                  key={p.persona_id}
                  type="button"
                  onClick={() => ir(p.persona_id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-tertiary"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{p.nombre}</span>
                    <span className="block text-[10px] text-slate-500">{CARGO_CHIP[p.cargo].label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-300">{formatoMonto(p.neto)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-violet-300">
          <Network className="h-3.5 w-3.5" /> Unidades de negocio
        </p>
        {nomina.unidades.map((u) =>
          item(
            `u:${u.key}`,
            u.nombre,
            `${u.personas.length} personas${u.coordinador?.crecimiento_pct != null ? ` · crec. ${formatoPct(u.coordinador.crecimiento_pct)}` : ''}`,
            u.usd,
            u.id === null,
          ))}

        {nomina.oficinas.length > 0 && (
          <p className="flex items-center gap-2 px-2 pb-1 pt-4 text-[10px] font-black uppercase tracking-wider text-sky-300">
            <Building2 className="h-3.5 w-3.5" /> Coordinación de oficinas
          </p>
        )}
        {nomina.oficinas.map((o) =>
          item(
            `o:${o.pago.persona_id}`,
            o.pago.nombre,
            o.pago.factor_pct === null ? 'cumplimiento sin definir' : `cumplimiento ${formatoPct(o.pago.factor_pct)}`,
            o.pago.neto,
          ))}

        <div className="mt-3 flex flex-col gap-0.5 border-t border-slate-800 px-2 pt-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total a pagar</span>
          <span className="font-mono text-lg font-black tabular-nums text-white">{formatoMonto(totalUsd)}</span>
          <span className="font-mono text-sm font-bold tabular-nums text-emerald-300">
            {formatoBs(totalBs(informe.pagos.map((p) => p.neto), props.tasa))}
          </span>
        </div>
      </aside>

      <div className="min-w-0 p-5">
        {unidad && <UnidadDetalle key={unidad.key} unidad={unidad} nomina={nomina} resaltado={resaltado} {...props} />}
        {oficina && <OficinaDetalle key={oficina.pago.persona_id} oficina={oficina} resaltado={resaltado} {...props} />}
        {props.tasa === null && (
          <p className="mt-4 text-[11px] text-amber-400">
            Los bolívares salen vacíos hasta que se conozca la tasa CONATEL del mes en que se paga.
          </p>
        )}
      </div>
    </div>
  );
}
