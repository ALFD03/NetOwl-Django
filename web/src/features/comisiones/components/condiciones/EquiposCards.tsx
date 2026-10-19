/** Los que cobran por las ventas de su equipo: supervisores y oficinas, y el coordinador de UN. */

import { useState } from 'react';
import { Crown, Plus, Store } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Button, NeonContainer, StatTile, TextField } from '@/shared/ui';
import {
  crecimientosDeMuestra, montoUn, ordenarTramosUn, pctCorto, rangoCrecimiento,
  type CampoSimple, type ErroresTramos,
} from '../../lib/condiciones';
import { formatoMonto } from '../../lib/formato';
import type { CondicionesComision, TramoUn } from '../../types';
import { Antes, BotonQuitar, CABECERA, CeldaNumero, ErrorFila } from './campos';

type Cambiar = (patch: Partial<CondicionesComision>) => void;

/** Un monto suelto editable, con su error y lo que valía. */
function CampoMonto({
  label, campo, borrador, guardadas, errores, cambiar,
}: {
  label: string;
  campo: 'monto_equipo' | 'monto_directa' | 'monto_directa_un';
  borrador: CondicionesComision;
  guardadas: CondicionesComision;
  errores: Partial<Record<CampoSimple, string>>;
  cambiar: Cambiar;
}) {
  const valor = borrador[campo];
  const cambiado = valor !== guardadas[campo];
  return (
    <div>
      <TextField
        label={label}
        type="number"
        step="any"
        min={0}
        value={Number.isNaN(valor) ? '' : valor}
        error={errores[campo]}
        className={cn(cambiado && !errores[campo] && 'border-amber-500/70 bg-amber-500/10 font-bold')}
        onChange={(e) => cambiar({ [campo]: e.target.value === '' ? NaN : Number(e.target.value) })}
      />
      <Antes valor={cambiado ? formatoMonto(guardadas[campo]) : null} />
    </div>
  );
}

/** El ejemplo de la política: un equipo de 40 ventas, 3 propias y un 80% de cumplimiento. */
const EJEMPLO = { equipo: 40, propias: 3, cumplimiento: 80 };
const pagoEjemplo = (c: CondicionesComision) =>
  ((EJEMPLO.equipo * c.monto_equipo + EJEMPLO.propias * c.monto_directa) * EJEMPLO.cumplimiento) / 100;

export function SupervisoresCard({
  borrador, guardadas, editando, errores, cambiar,
}: {
  borrador: CondicionesComision;
  guardadas: CondicionesComision;
  editando: boolean;
  errores: Partial<Record<CampoSimple, string>>;
  cambiar: Cambiar;
}) {
  const ejemplo = pagoEjemplo(borrador);
  const ejemploAntes = pagoEjemplo(guardadas);
  return (
    <NeonContainer
      title="Supervisores y coordinadores de oficina"
      subtitle="La misma regla para los dos cargos"
      icon={<Store className="h-5 w-5" />}
      theme="green"
    >
      <div className="flex flex-col gap-5">
        {editando ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoMonto label="Por venta de su equipo ($)" campo="monto_equipo" borrador={borrador} guardadas={guardadas} errores={errores} cambiar={cambiar} />
            <CampoMonto label="Por venta propia ($)" campo="monto_directa" borrador={borrador} guardadas={guardadas} errores={errores} cambiar={cambiar} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatTile variant="boxed" size="lg" mono label="Por venta de su equipo" value={formatoMonto(borrador.monto_equipo)} />
            <StatTile variant="boxed" size="lg" mono label="Por venta propia" value={formatoMonto(borrador.monto_directa)} />
          </div>
        )}
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs text-slate-300">
          <span className="text-xl font-black text-emerald-400" aria-hidden>×</span>
          <span>
            % de cumplimiento del objetivo, <strong className="text-white">con tope en 100%</strong>. Se escribe en el
            informe de cada periodo.
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <span className={CABECERA}>Ejemplo</span>
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 px-4 py-3 text-xs leading-relaxed">
            Equipo con <strong className="text-white">{EJEMPLO.equipo}</strong> ventas y{' '}
            <strong className="text-white">{EJEMPLO.propias}</strong> propias, cumplimiento{' '}
            <strong className="text-white">{EJEMPLO.cumplimiento}%</strong>
            <br />
            <span className="text-slate-400">
              ({EJEMPLO.equipo} × {formatoMonto(borrador.monto_equipo)} + {EJEMPLO.propias} × {formatoMonto(borrador.monto_directa)}) × {EJEMPLO.cumplimiento}% ={' '}
            </span>
            <strong className="font-mono text-sm tabular-nums text-emerald-400">{Number.isFinite(ejemplo) ? formatoMonto(ejemplo) : '—'}</strong>
            {editando && ejemplo !== ejemploAntes && (
              <span className="ml-2 font-mono tabular-nums text-slate-500 line-through">{formatoMonto(ejemploAntes)}</span>
            )}
          </div>
        </div>
      </div>
    </NeonContainer>
  );
}

/** Más intenso cuanto más paga el tramo. */
const TONO_UN = ['bg-violet-500/10 border-violet-500/25', 'bg-violet-500/20 border-violet-500/35', 'bg-violet-500/30 border-violet-500/45', 'bg-violet-500/40 border-violet-400/55'];

function LecturaUn({ tramos, montoDirecta }: { tramos: TramoUn[]; montoDirecta: number }) {
  const ordenados = ordenarTramosUn(tramos);
  const muestra = crecimientosDeMuestra(tramos);
  const [crecimiento, setCrecimiento] = useState(() => muestra[Math.floor(muestra.length / 2)] ?? 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-1 sm:auto-cols-fr sm:grid-flow-col">
          {ordenados.map((t, i) => (
            <div key={t.desde_pct ?? 'siempre'} className={cn('rounded-lg border px-3 py-3', TONO_UN[Math.min(i, TONO_UN.length - 1)])}>
              <div className="text-[11px] text-slate-300">{rangoCrecimiento(t, ordenados)}</div>
              <div className="mt-1 font-mono text-xl font-black tabular-nums text-white">{formatoMonto(t.monto)}</div>
            </div>
          ))}
        </div>
        <span className="text-[11px] text-slate-500">
          Por venta de su equipo. Un crecimiento negativo cae en el primer tramo; el que cae justo en un corte ya cobra
          el tramo que empieza ahí.
        </span>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
        <span className={CABECERA}>Simular crecimiento</span>
        <div className="flex flex-wrap gap-1.5">
          {muestra.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === crecimiento}
              onClick={() => setCrecimiento(c)}
              className={cn(
                'rounded-full border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors',
                c === crecimiento ? 'border-violet-400 bg-violet-500/30 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-500',
              )}
            >
              {pctCorto(c)}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-300">
          Con <strong className="text-white">{pctCorto(crecimiento)}</strong> de crecimiento cobra{' '}
          <strong className="font-mono tabular-nums text-violet-300">{formatoMonto(montoUn(crecimiento, tramos))}</strong> por venta del equipo
        </span>
      </div>
      <StatTile variant="boxed" size="lg" mono label="Por venta propia" value={formatoMonto(montoDirecta)} caption="Sin objetivo: no se multiplica por nada" />
    </div>
  );
}

function EdicionUn({
  tramos, guardados, errores, onChange,
}: {
  tramos: TramoUn[];
  guardados: TramoUn[];
  errores: ErroresTramos;
  onChange: (tramos: TramoUn[]) => void;
}) {
  const siempre = tramos.findIndex((t) => t.desde_pct === null);
  const previos = new Map(guardados.map((t) => [t.desde_pct, t]));
  const validos = ordenarTramosUn(tramos.filter((_, i) => !errores.filas.has(i)));
  const cambiar = (i: number, patch: Partial<TramoUn>) => onChange(tramos.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const agregar = () => {
    const cortes = tramos.map((t) => t.desde_pct).filter((d): d is number => d !== null);
    onChange([...tramos, { desde_pct: cortes.length ? Math.max(...cortes) + 1 : 0, monto: 0 }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-xs text-slate-300">
          <thead>
            <tr className={CABECERA}>
              <th className="py-2 pr-2 text-left">Crecimiento desde (%)</th>
              <th className="px-2 py-2 text-left">Rango</th>
              <th className="px-2 py-2 text-left">Monto por venta</th>
              <th className="py-2"><span className="sr-only">Quitar</span></th>
            </tr>
          </thead>
          {tramos.map((tramo, i) => {
            const previo = previos.get(tramo.desde_pct);
            const error = errores.filas.get(i);
            const n = i + 1;
            return (
              <tbody key={i} className={cn('border-t border-slate-800/60', error && 'bg-rose-500/5')}>
                <tr>
                  <td className="py-2 pr-2 align-top leading-9">
                    {i === siempre ? (
                      <span className="text-slate-400">siempre</span>
                    ) : (
                      <CeldaNumero label={`Crecimiento desde, tramo ${n}`} placeholder="%" value={tramo.desde_pct} error={Boolean(error)} onChange={(v) => cambiar(i, { desde_pct: v })} />
                    )}
                  </td>
                  <td className="px-2 py-2 align-top leading-9">
                    {validos.includes(tramo) ? (
                      <span className="font-semibold text-white">{rangoCrecimiento(tramo, validos)}</span>
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
                  <td className="py-2 text-right align-top">
                    {i !== siempre && <BotonQuitar label={`Quitar tramo ${n}`} onClick={() => onChange(tramos.filter((_, j) => j !== i))} />}
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
      {errores.general && <ErrorFila>{errores.general}</ErrorFila>}
      <div>
        <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={agregar}>
          Añadir tramo
        </Button>
      </div>
    </div>
  );
}

export function CoordinadorUnCard({
  borrador, guardadas, editando, errores, erroresCampos, cambiar,
}: {
  borrador: CondicionesComision;
  guardadas: CondicionesComision;
  editando: boolean;
  errores: ErroresTramos;
  erroresCampos: Partial<Record<CampoSimple, string>>;
  cambiar: Cambiar;
}) {
  return (
    <NeonContainer
      title="Coordinadores de unidad de negocio"
      subtitle="Por venta de su equipo, según el crecimiento del mes de sus unidades"
      icon={<Crown className="h-5 w-5" />}
      theme="purple"
    >
      {editando ? (
        <div className="flex flex-col gap-5">
          <EdicionUn tramos={borrador.tramos_un} guardados={guardadas.tramos_un} errores={errores} onChange={(tramos_un) => cambiar({ tramos_un })} />
          <div className="sm:max-w-xs">
            <CampoMonto label="Por venta propia ($)" campo="monto_directa_un" borrador={borrador} guardadas={guardadas} errores={erroresCampos} cambiar={cambiar} />
          </div>
        </div>
      ) : (
        <LecturaUn tramos={borrador.tramos_un} montoDirecta={borrador.monto_directa_un} />
      )}
    </NeonContainer>
  );
}
