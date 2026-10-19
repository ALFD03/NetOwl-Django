/**
 * Comisiones › Condiciones de pago: tramos, tarifas, días promocionales y los % PYME.
 *
 * Se abre en lectura, explicando cada regla con lo que paga; «Editar» pasa a
 * los formularios, con los cambios pendientes a la vista y los errores en la
 * fila que los causa antes de mandar nada al servidor.
 */

import { useEffect, useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import { AlertTriangle, Pencil, Save, Undo2 } from 'lucide-react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { comisionesApi } from '@/shared/lib/api/comisiones';
import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, Panel, StatusMessage } from '@/shared/ui';
import { cambiosPendientes, validarCondiciones, type Cambio } from '../lib/condiciones';
import type { ActualizacionCondiciones, ComisionesCondicionesProps, CondicionesComision } from '../types';
import { AsesoresCard } from './condiciones/AsesoresCard';
import { CoordinadorUnCard, SupervisoresCard } from './condiciones/EquiposCards';
import { PeriodoCard } from './condiciones/PeriodoCard';
import { PlanesPymeCard } from './condiciones/PlanesPymeCard';
import { RecorridoVenta, ResumenCargos } from './condiciones/ResumenCargos';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Vigencia({ actualizacion }: { actualizacion: ActualizacionCondiciones }) {
  const fecha = actualizacion.en ? new Date(actualizacion.en) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-semibold text-white">
        {fecha
          ? `Vigentes · modificadas el ${fecha.toLocaleDateString('es-VE')} a las ${fecha.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}${actualizacion.por ? ` por ${actualizacion.por}` : ''}`
          : 'Vigentes · las de la política, sin cambios desde entonces'}
      </span>
      <span className="text-xs text-slate-400">
        Los cambios valen para lo que se calcule desde ahora; un periodo cerrado conserva las condiciones con que se cerró.
      </span>
    </div>
  );
}

function ListaCambios({ cambios }: { cambios: Cambio[] }) {
  return (
    <Panel title="Cambios pendientes">
      <ul className="flex flex-col gap-2 text-sm">
        {cambios.map((c) => (
          <li key={c.donde} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
            <span className="text-slate-400">{c.donde}</span>
            {c.antes === null && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">nuevo</span>}
            {c.despues === null && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">quitado</span>}
            {c.antes !== null && <span className="font-mono tabular-nums text-slate-500 line-through">{c.antes}</span>}
            {c.despues !== null && <span className="font-mono font-bold tabular-nums text-white">{c.antes !== null ? '→ ' : ''}{c.despues}</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Las condiciones no se versionan: un periodo cerrado guarda una copia de las
 * que usó, así que cambiarlas solo afecta a lo que se calcule después (los
 * borradores incluidos, que se recalculan al abrirlos).
 */
export function CondicionesView({ condiciones, actualizacion, planesPyme, puedeEditarPlanes }: ComisionesCondicionesProps) {
  const [draft, setDraft] = useState<CondicionesComision>(condiciones);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tras guardar, la recarga trae las condiciones como las dejó el servidor (tramos ordenados):
  // el borrador se reinicia con ellas en el mismo render, sin un efecto de por medio.
  const [base, setBase] = useState(condiciones);
  if (base !== condiciones) {
    setBase(condiciones);
    setDraft(condiciones);
  }

  const cambios = useMemo(() => cambiosPendientes(condiciones, draft), [condiciones, draft]);
  const validacion = useMemo(() => validarCondiciones(draft), [draft]);
  const sucio = editando && cambios.length > 0;

  // Salir con cambios sin guardar pregunta antes, cierre la pestaña o navegue por la app.
  useEffect(() => {
    if (!sucio) return undefined;
    const alCerrar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', alCerrar);
    const quitar = router.on('before', (event) => {
      // Las recargas parciales (la de después de guardar) no salen de la página.
      if (event.detail.visit.only.length) return undefined;
      return window.confirm('Hay cambios sin guardar en las condiciones. ¿Salir sin guardarlos?');
    });
    return () => {
      window.removeEventListener('beforeunload', alCerrar);
      quitar();
    };
  }, [sucio]);

  const cambiar = (patch: Partial<CondicionesComision>) => setDraft((d) => ({ ...d, ...patch }));

  const descartar = () => {
    setDraft(condiciones);
    setEditando(false);
    setEstado(null);
  };

  const guardar = async () => {
    setGuardando(true);
    setEstado(null);
    try {
      const respuesta = await comisionesApi.guardarCondiciones({ ...draft });
      setEditando(false);
      setEstado({ type: 'success', text: respuesta.message });
      router.reload({ only: ['condiciones', 'actualizacion'] });
    } catch (err: unknown) {
      setEstado({ type: 'error', text: getApiErrorMessage(err, 'No se pudieron guardar las condiciones.') });
    } finally {
      setGuardando(false);
    }
  };

  const toolbar = editando ? (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-amber-500/40 bg-amber-950/30 p-4 shadow-xl">
      <div className="flex min-w-0 items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-white">
            {cambios.length ? `${plural(cambios.length, 'cambio', 'cambios')} sin guardar` : 'Editando: todavía sin cambios'}
            {validacion.total > 0 && <span className="text-rose-400"> · {plural(validacion.total, 'error', 'errores')} por corregir</span>}
          </span>
          <span className="text-xs text-slate-400">
            Valdrán para lo que se calcule desde que guardes, borradores incluidos. Los periodos cerrados no cambian.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={descartar} disabled={guardando}>
          Descartar
        </Button>
        <Button
          icon={<Save className="h-4 w-4" />}
          isLoading={guardando}
          disabled={!cambios.length || validacion.total > 0}
          title={validacion.total > 0 ? 'Corrige los errores antes de guardar' : undefined}
          onClick={() => void guardar()}
        >
          Guardar condiciones
        </Button>
      </div>
    </div>
  ) : (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
      <Vigencia actualizacion={actualizacion} />
      <Button icon={<Pencil className="h-4 w-4" />} onClick={() => { setEstado(null); setEditando(true); }}>
        Editar condiciones
      </Button>
    </div>
  );

  return (
    <AppLayout toolbar={toolbar}>
      <StatusMessage status={estado} className="mb-4" icon={<AlertTriangle />} />

      <div className="flex flex-col gap-6">
        {editando && cambios.length > 0 && <ListaCambios cambios={cambios} />}

        {!editando && (
          <>
            <ResumenCargos condiciones={draft} />
            <RecorridoVenta condiciones={draft} />
          </>
        )}

        <AsesoresCard
          tramos={draft.tramos_asesor}
          guardados={condiciones.tramos_asesor}
          editando={editando}
          errores={validacion.asesor}
          onChange={(tramos_asesor) => cambiar({ tramos_asesor })}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SupervisoresCard borrador={draft} guardadas={condiciones} editando={editando} errores={validacion.campos} cambiar={cambiar} />
          <CoordinadorUnCard
            borrador={draft}
            guardadas={condiciones}
            editando={editando}
            errores={validacion.un}
            erroresCampos={validacion.campos}
            cambiar={cambiar}
          />
        </div>

        {editando ? (
          <>
            <PeriodoCard borrador={draft} guardadas={condiciones} editando errores={validacion.campos} cambiar={cambiar} />
            <PlanesPymeCard planes={planesPyme} puedeEditarPlanes={puedeEditarPlanes} compacto />
          </>
        ) : (
          <>
            <PlanesPymeCard planes={planesPyme} puedeEditarPlanes={puedeEditarPlanes} compacto={false} />
            <PeriodoCard borrador={draft} guardadas={condiciones} editando={false} errores={validacion.campos} cambiar={cambiar} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
