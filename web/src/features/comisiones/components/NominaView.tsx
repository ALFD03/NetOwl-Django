/** Comisiones › Informe › Nómina: equipo por equipo, con sus roles, sus supervisores y los asesores de cada uno. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Users, X } from 'lucide-react';

import { formatoBs, formatoMonto, totalBs } from '../lib/formato';
import { armarNomina, clavePago } from '../lib/nomina';
import type { ComisionesInformeProps, InformeComision } from '../types';
import { ROL_CHIP } from './piezas';
import { EquipoDetalle, type DetalleProps } from './EquipoDetalle';

interface NominaViewProps extends Omit<DetalleProps, 'resaltado'> {
  informe: InformeComision;
  /** Los equipos con sus roles, para nombrar y ordenar la nómina. */
  equipos: ComisionesInformeProps['equipos'];
}

/**
 * La nómina del periodo, de solo lectura: a la izquierda los equipos de ventas
 * con lo que cobra cada uno, a la derecha el elegido. Los % se escriben en el
 * paso de Indicadores, nunca aquí.
 *
 * Cada persona sale una vez por equipo (ver `lib/nomina`), así que la suma de
 * la lista es el total a pagar.
 */
export function NominaView({ informe, equipos, ...props }: NominaViewProps) {
  const nomina = useMemo(() => armarNomina(informe, equipos), [informe, equipos]);
  const primera = nomina.equipos[0]?.slug ?? '';
  const [elegida, setElegida] = useState(primera);
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState<string | null>(null);
  const detalleRef = useRef<HTMLDivElement>(null);
  const subir = useRef(false);

  // Al cambiar de periodo, lo elegido puede no existir.
  const actual = nomina.equipos.some((e) => e.slug === elegida) ? elegida : primera;

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

  const ir = (clave: string) => {
    const donde = nomina.ubicacion.get(clave);
    if (!donde) return;
    setElegida(donde);
    setResaltado(clave);
    setBusqueda('');
  };

  if (informe.pagos.length === 0) {
    return <p className="p-10 text-center text-sm text-slate-500">Nadie cobra en este periodo.</p>;
  }

  const equipo = nomina.equipos.find((e) => e.slug === actual);
  const totalUsd = Math.round(informe.pagos.reduce((t, p) => t + p.neto, 0) * 100) / 100;
  const elegir = (slug: string) => {
    setElegida(slug);
    setResaltado(null);
    subir.current = true;
  };

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
                  key={clavePago(p)}
                  type="button"
                  onClick={() => ir(clavePago(p))}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-tertiary"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{p.nombre}</span>
                    <span className="block text-[10px] text-slate-500">{ROL_CHIP[p.rol].label} · {p.equipo_nombre}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-300">{formatoMonto(p.neto)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-violet-300">
          <Users className="h-3.5 w-3.5" /> Equipos de ventas
        </p>
        {nomina.equipos.map((e) => (
          <button
            key={e.slug}
            type="button"
            onClick={() => elegir(e.slug)}
            aria-current={actual === e.slug}
            className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition ${
              actual === e.slug ? 'border-sky-500/40 bg-surface-tertiary' : 'border-transparent hover:bg-surface-secondary'
            }`}
          >
            <span className="truncate text-sm font-bold text-white">{e.nombre}</span>
            <span className="flex justify-between gap-2 text-[11px] text-slate-400">
              <span className="truncate">{e.personas.length} {e.personas.length === 1 ? 'persona' : 'personas'}</span>
              <span className="shrink-0 font-mono tabular-nums text-slate-300">{formatoMonto(e.usd)}</span>
            </span>
          </button>
        ))}

        <div className="mt-3 flex flex-col gap-0.5 border-t border-slate-800 px-2 pt-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total a pagar</span>
          <span className="font-mono text-lg font-black tabular-nums text-white">{formatoMonto(totalUsd)}</span>
          <span className="font-mono text-sm font-bold tabular-nums text-emerald-300">
            {formatoBs(totalBs(informe.pagos.map((p) => p.neto), props.tasa))}
          </span>
          {Boolean(informe.resumen.bonos) && (
            <span className="text-[11px] text-amber-400">incluye {formatoMonto(informe.resumen.bonos ?? 0)} de bonos</span>
          )}
        </div>
      </aside>

      <div className="min-w-0 p-5">
        {equipo && <EquipoDetalle key={equipo.slug} equipo={equipo} nomina={nomina} resaltado={resaltado} {...props} />}
        {props.tasa === null && (
          <p className="mt-4 text-[11px] text-amber-400">
            Los bolívares salen vacíos hasta que se conozca la tasa CONATEL del mes en que se paga.
          </p>
        )}
      </div>
    </div>
  );
}
