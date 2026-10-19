/**
 * Los tramos del asesor: en lectura, la tabla con sus rangos y saltos, el pago
 * según las ventas y un simulador; en edición, la tabla editable y lo que el
 * cambio supone para un asesor.
 */

import { useMemo, useState } from 'react';
import { Minus, Plus, Users } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Button, NeonContainer } from '@/shared/ui';
import {
  leerTramosAsesor, ordenarTramosAsesor, pagoAsesor, rangoVentas, ventasDeMuestra, type ErroresTramos,
} from '../../lib/condiciones';
import { formatoMonto } from '../../lib/formato';
import type { TramoAsesor } from '../../types';
import { Antes, BotonQuitar, CABECERA, CeldaNumero, ErrorFila } from './campos';

/** El color de cada tramo en la tabla y en el gráfico: más claro cuanto más paga. */
const TONO_TRAMO = ['bg-sky-900', 'bg-sky-800', 'bg-sky-700', 'bg-sky-600', 'bg-sky-500', 'bg-sky-400'];
const tonoTramo = (tramo: TramoAsesor | null, ordenados: TramoAsesor[]): string => {
  if (!tramo || tramo.monto === 0) return 'bg-slate-700';
  const pagan = ordenados.filter((t) => t.monto > 0);
  return TONO_TRAMO[Math.min(pagan.indexOf(tramo), TONO_TRAMO.length - 1)];
};

function TablaTramos({ tramos }: { tramos: TramoAsesor[] }) {
  const ordenados = ordenarTramosAsesor(tramos);
  const leidos = leerTramosAsesor(tramos);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm text-slate-300">
          <thead>
            <tr className={CABECERA}>
              <th className="py-2 pr-3 text-left">Ventas</th>
              <th className="px-3 py-2 text-left">Cómo se paga</th>
              <th className="px-3 py-2 text-right">Cobra</th>
              <th className="py-2 pl-3 text-right">Al entrar</th>
            </tr>
          </thead>
          <tbody>
            {leidos.map((l) => (
              <tr key={l.tramo.desde} className="border-t border-slate-800/60">
                <td className="py-3 pr-3">
                  <span className="flex items-center gap-2 font-bold text-white">
                    <span className={cn('h-2.5 w-2.5 rounded-sm', tonoTramo(l.tramo, ordenados))} aria-hidden />
                    {l.rango}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={l.tramo.monto === 0 ? 'text-slate-400' : 'text-white'}>{l.formula}</span>
                  {l.nota && <span className="block text-[11px] text-slate-500">{l.nota}</span>}
                </td>
                <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-white">{l.cobra}</td>
                <td className="py-3 pl-3 text-right">
                  {l.salto === null ? (
                    <span className="text-slate-600">—</span>
                  ) : (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-amber-400">
                      +{formatoMonto(l.salto)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        «Al entrar» es lo que gana el asesor con la venta que lo hace cambiar de tramo, cuando vale más que una venta
        normal: ahí la regla deja de descontar o sube el monto de todas.
      </p>
    </div>
  );
}

/** Desde dónde arranca el simulador: la última venta antes del primer salto, que es donde más se nota. */
function ventasIniciales(tramos: TramoAsesor[]): number {
  const conSalto = leerTramosAsesor(tramos).find((l) => l.salto !== null);
  return conSalto ? Math.max(0, conSalto.tramo.desde - 1) : 10;
}

function GraficoPago({ tramos }: { tramos: TramoAsesor[] }) {
  const ordenados = useMemo(() => ordenarTramosAsesor(tramos), [tramos]);
  const tope = Math.max(30, (ordenados[ordenados.length - 1]?.desde ?? 0) + 6);
  const [ventas, setVentas] = useState(() => ventasIniciales(tramos));
  const puntos = useMemo(
    () => Array.from({ length: tope + 1 }, (_, n) => ({ n, ...pagoAsesor(n, ordenados) })),
    [ordenados, tope],
  );
  const maximo = Math.max(1, ...puntos.map((p) => p.monto));

  const actual = pagoAsesor(ventas, ordenados);
  const siguiente = pagoAsesor(ventas + 1, ordenados);
  const cambiaDeTramo = siguiente.tramo !== actual.tramo;
  const tramo = actual.tramo;

  let formula = 'no cobra';
  if (tramo && tramo.monto > 0) {
    formula = tramo.descontar
      ? `se pagan ${actual.pagadas} de ${ventas} × ${formatoMonto(tramo.monto)}`
      : `${ventas} × ${formatoMonto(tramo.monto)}`;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={CABECERA}>Pago según ventas del mes</span>
        <span className="text-[11px] text-slate-500">Elige una barra para simular</span>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/30 px-4 pb-2 pt-4">
        <div className="flex h-48 items-end gap-0.5">
          {puntos.map((p) => (
            <button
              key={p.n}
              type="button"
              aria-label={`${p.n} ventas: ${formatoMonto(p.monto)}`}
              title={`${p.n} ventas: ${formatoMonto(p.monto)}`}
              onClick={() => setVentas(p.n)}
              className={cn(
                'min-w-0 flex-1 rounded-t-sm transition-colors hover:opacity-80',
                p.n === ventas ? 'bg-amber-400' : tonoTramo(p.tramo, ordenados),
              )}
              style={{ height: `${Math.max(1.5, (p.monto / maximo) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex gap-0.5 border-t border-slate-700 pt-1" aria-hidden>
          {puntos.map((p) => (
            <span key={p.n} className="min-w-0 flex-1 text-center font-mono text-[9px] text-slate-500">
              {p.n % 5 === 0 ? p.n : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Una venta menos" icon={<Minus className="h-4 w-4" />} onClick={() => setVentas((n) => Math.max(0, n - 1))} />
          <div className="min-w-[64px] text-center">
            <div className="font-mono text-3xl font-black tabular-nums leading-none text-white">{ventas}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">ventas</div>
          </div>
          <Button variant="secondary" size="sm" aria-label="Una venta más" icon={<Plus className="h-4 w-4" />} onClick={() => setVentas((n) => Math.min(tope, n + 1))} />
        </div>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <span className="text-xs text-slate-400">
            Tramo <strong className="text-white">{tramo ? rangoVentas(tramo, ordenados) : '—'}</strong> · {formula}
          </span>
          <span className="font-mono text-2xl font-black tabular-nums text-sky-400">{formatoMonto(actual.monto)}</span>
          <span className={cn('text-xs font-semibold', cambiaDeTramo ? 'text-amber-400' : 'text-slate-400')}>
            Con {ventas + 1} ventas: {formatoMonto(siguiente.monto)} (+{formatoMonto(siguiente.monto - actual.monto)}
            {cambiaDeTramo ? ', cambia de tramo' : ''})
          </span>
        </div>
      </div>
    </div>
  );
}

function EdicionTramos({
  tramos, guardados, errores, onChange,
}: {
  tramos: TramoAsesor[];
  guardados: TramoAsesor[];
  errores: ErroresTramos;
  onChange: (tramos: TramoAsesor[]) => void;
}) {
  const previos = new Map(guardados.map((t) => [t.desde, t]));
  const validos = ordenarTramosAsesor(tramos.filter((_, i) => !errores.filas.has(i)));
  const cambiar = (i: number, patch: Partial<TramoAsesor>) =>
    onChange(tramos.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const agregar = () => {
    const inicios = tramos.map((t) => t.desde).filter(Number.isFinite);
    onChange([...tramos, { desde: inicios.length ? Math.max(...inicios) + 1 : 0, monto: 0, descontar: 0 }]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs text-slate-300">
          <thead>
            <tr className={CABECERA}>
              <th className="py-2 pr-2 text-left">Desde (ventas)</th>
              <th className="px-2 py-2 text-left">Rango</th>
              <th className="px-2 py-2 text-left">Monto por venta</th>
              <th className="px-2 py-2 text-left">Ventas no pagadas</th>
              <th className="py-2"><span className="sr-only">Quitar</span></th>
            </tr>
          </thead>
          {tramos.map((tramo, i) => {
            const previo = Number.isFinite(tramo.desde) ? previos.get(tramo.desde) : undefined;
            const error = errores.filas.get(i);
            const n = i + 1;
            return (
              <tbody key={i} className={cn('border-t border-slate-800/60', error && 'bg-rose-500/5')}>
                <tr>
                  <td className="py-2 pr-2 align-top">
                    <CeldaNumero label={`Desde, tramo ${n}`} min={0} value={tramo.desde} error={Boolean(error)} onChange={(v) => cambiar(i, { desde: v ?? NaN })} />
                  </td>
                  <td className="px-2 py-2 align-top leading-9">
                    {validos.includes(tramo) ? (
                      <span className="font-semibold text-white">{rangoVentas(tramo, validos)}</span>
                    ) : (
                      <span className="text-rose-400">—</span>
                    )}
                    {!previo && !error && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">nuevo</span>}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <CeldaNumero
                      label={`Monto por venta, tramo ${n}`}
                      min={0}
                      value={tramo.monto}
                      cambiado={Boolean(previo) && previo?.monto !== tramo.monto}
                      onChange={(v) => cambiar(i, { monto: v ?? NaN })}
                    />
                    <Antes valor={previo && previo.monto !== tramo.monto ? formatoMonto(previo.monto) : null} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <CeldaNumero
                      label={`Ventas no pagadas, tramo ${n}`}
                      min={0}
                      value={tramo.descontar}
                      cambiado={Boolean(previo) && previo?.descontar !== tramo.descontar}
                      onChange={(v) => cambiar(i, { descontar: v ?? NaN })}
                    />
                    <Antes valor={previo && previo.descontar !== tramo.descontar ? String(previo.descontar) : null} />
                  </td>
                  <td className="py-2 text-right align-top">
                    <BotonQuitar label={`Quitar tramo ${n}`} onClick={() => onChange(tramos.filter((_, j) => j !== i))} />
                  </td>
                </tr>
                {error && (
                  <tr>
                    <td colSpan={5} className="pb-2"><ErrorFila>{error}</ErrorFila></td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
      {errores.general && <ErrorFila>{errores.general}</ErrorFila>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={agregar}>
          Añadir tramo
        </Button>
        <span className="text-[11px] text-slate-500">
          El primero empieza en 0. Las ventas no pagadas son las que se descuentan antes de multiplicar por el monto.
        </span>
      </div>
    </div>
  );
}

/** Cuánto cobra un asesor con la tabla guardada y con la que se está editando. */
function ImpactoCambio({ guardados, tramos, hayErrores }: { guardados: TramoAsesor[]; tramos: TramoAsesor[]; hayErrores: boolean }) {
  if (hayErrores) {
    return <p className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4 text-xs text-slate-400">Corrige los tramos para ver qué cambia para un asesor.</p>;
  }
  const filas = ventasDeMuestra(guardados, tramos).map((n) => {
    const hoy = pagoAsesor(n, guardados).monto;
    const nuevo = pagoAsesor(n, tramos).monto;
    return { n, hoy, nuevo, dif: Math.round((nuevo - hoy) * 100) / 100 };
  });
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/30">
      <table className="w-full min-w-[360px] text-xs text-slate-300">
        <thead>
          <tr className={CABECERA}>
            <th className="px-4 py-2.5 text-left">Ventas</th>
            <th className="px-3 py-2.5 text-right">Hoy</th>
            <th className="px-3 py-2.5 text-right">Con el cambio</th>
            <th className="px-4 py-2.5 text-right">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.n} className="border-t border-slate-800/60 font-mono tabular-nums">
              <td className="px-4 py-2 font-bold text-white">{f.n}</td>
              <td className="px-3 py-2 text-right">{formatoMonto(f.hoy)}</td>
              <td className={cn('px-3 py-2 text-right', f.dif ? 'font-semibold text-white' : 'text-slate-500')}>{formatoMonto(f.nuevo)}</td>
              <td className={cn('px-4 py-2 text-right font-bold', f.dif > 0 && 'text-emerald-400', f.dif < 0 && 'text-rose-400', !f.dif && 'text-slate-600')}>
                {f.dif ? `${f.dif > 0 ? '+' : '−'}${formatoMonto(Math.abs(f.dif))}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AsesoresCard({
  tramos, guardados, editando, errores, onChange,
}: {
  tramos: TramoAsesor[];
  guardados: TramoAsesor[];
  editando: boolean;
  errores: ErroresTramos;
  onChange: (tramos: TramoAsesor[]) => void;
}) {
  const hayErrores = errores.filas.size > 0 || Boolean(errores.general);
  return (
    <NeonContainer
      title="Asesores de venta"
      subtitle={editando
        ? 'Cada tramo vale desde su inicio hasta el siguiente; el rango se calcula solo'
        : 'Por tramos de ventas residenciales válidas en el periodo'}
      icon={<Users className="h-5 w-5" />}
      theme="blue"
    >
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        {editando ? (
          <>
            <EdicionTramos tramos={tramos} guardados={guardados} errores={errores} onChange={onChange} />
            <div className="flex min-w-0 flex-col gap-3">
              <span className={CABECERA}>Qué cambia para un asesor</span>
              <ImpactoCambio guardados={guardados} tramos={tramos} hayErrores={hayErrores} />
            </div>
          </>
        ) : (
          <>
            <TablaTramos tramos={tramos} />
            <GraficoPago tramos={tramos} />
          </>
        )}
      </div>
    </NeonContainer>
  );
}
