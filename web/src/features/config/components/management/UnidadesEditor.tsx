/**
 * Las unidades de negocio que ve una cuenta o un grupo sin el permiso de verlas
 * todas.
 *
 * La lista sale del catálogo (Catálogos › Ventas), no de una constante: las
 * unidades cambian. Solo restringe la página Unidades de negocio, y el
 * consolidado FTTH se ve siempre. El bloque RF va como una unidad más porque en
 * el reporte lo es, aunque no sea un coordinador.
 */

import { Lock, UserCheck } from 'lucide-react';

import { Switch } from '@/shared/ui';
import type { UnidadNegocio, UnidadesSeleccion } from '@/features/config/types';

interface Props {
  unidades: UnidadesSeleccion;
  onChange: (unidades: UnidadesSeleccion) => void;
  catalogo: readonly UnidadNegocio[];
  /** La matriz concede todas las unidades: la lista no rige. */
  todas: boolean;
  /** Heredado de un grupo: se ve, pero no se edita. */
  disabled?: boolean;
  /**
   * Lo que puede conceder quien edita (`null`: todas). Lo demás se ve apagado
   * salvo que ya estuviera en `previa`; el servidor lo rechaza igual (ver
   * `unidades_fuera_de_alcance`).
   */
  concedibles: UnidadesSeleccion | null;
  previa: UnidadesSeleccion;
}

const ETIQUETA_RF = 'Nodos radiofrecuencia (RF)';

export function UnidadesEditor({ unidades, onChange, catalogo, todas, disabled = false, concedibles, previa }: Props) {
  const bloqueada = (id: number) =>
    concedibles !== null && !concedibles.ids.includes(id) && !previa.ids.includes(id);
  const rfBloqueado = concedibles !== null && !concedibles.rf && !previa.rf;

  const marcar = (id: number, valor: boolean) => {
    if (disabled || (valor && bloqueada(id))) return;
    const ids = valor ? [...unidades.ids, id] : unidades.ids.filter((actual) => actual !== id);
    onChange({ ...unidades, ids });
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-surface-primary overflow-hidden">
      <header className="flex items-start gap-3 border-b border-slate-800/70 bg-slate-900/40 px-4 py-3">
        <span className="rounded-xl border border-slate-700 p-2 text-sky-400">
          <UserCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-wider text-white">Unidades de negocio</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Qué unidades ve en la página Unidades de negocio. El consolidado FTTH se ve siempre.
          </p>
        </div>
      </header>

      <div className="p-3">
        {todas ? (
          <p className="text-xs text-slate-400">
            Ve <strong className="text-white">todas</strong> las unidades. Quita «Todas las unidades de negocio» en
            Subscriptions para elegir unas concretas.
          </p>
        ) : (
          <>
            {catalogo.length === 0 && (
              <p className="mb-2 text-xs text-slate-500">No hay unidades en el catálogo.</p>
            )}
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {catalogo.map((unidad) => (
                <Switch
                  key={unidad.id}
                  checked={unidades.ids.includes(unidad.id)}
                  onChange={(valor) => marcar(unidad.id, valor)}
                  label={unidad.nombre}
                  tone="blue"
                  disabled={disabled || bloqueada(unidad.id)}
                />
              ))}
              <Switch
                checked={unidades.rf}
                onChange={(rf) => !disabled && !(rf && rfBloqueado) && onChange({ ...unidades, rf })}
                label={ETIQUETA_RF}
                tone="blue"
                disabled={disabled || rfBloqueado}
              />
            </div>
            {!disabled && (concedibles !== null) && (
              <p className="mt-2 flex items-start gap-2 text-[11px] text-slate-500">
                <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Las apagadas son unidades que tú no ves: no puedes concederlas.</span>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
