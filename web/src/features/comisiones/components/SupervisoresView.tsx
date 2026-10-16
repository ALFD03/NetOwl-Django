/** Comisiones › Supervisores por UN: a qué coordinador de unidad de negocio responde cada supervisor. */

import { useMemo, useState } from 'react';
import { router } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Compass, UserCheck, X } from 'lucide-react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { comisionesApi } from '@/shared/lib/api/comisiones';
import { AppLayout } from '@/shared/layout/AppLayout';
import {
  Button, DataTable, NeonContainer, SelectMenu, StatusMessage, SummaryStrip, type Column,
} from '@/shared/ui';
import type { ComisionesSupervisoresProps, SupervisorUnidad } from '../types';

const NINGUNO = '';
const SIN_UN = 'Sin coordinador de UN';

const nombre = (s: SupervisorUnidad) => `${s.nombre} ${s.apellido}`.trim();

/**
 * Lo único que Comisiones configura de la estructura de ventas: el
 * coordinador de UN de cada supervisor, que Odoo no trae.
 *
 * Todo lo demás sale de la propia venta: quién vendió (`Medio`), su
 * supervisor (`Oportunidad/Administrador`) y su oficina (`Vendedor`). El coordinador de
 * UN cobra por las ventas de los supervisores que le responden, sean de la
 * oficina que sean; las de un supervisor sin coordinador no le pagan a
 * ninguno.
 *
 * Se asigna fila a fila o en bloque: filtrar, marcar y asignar.
 */
export function SupervisoresView({ supervisores, coordinadores }: ComisionesSupervisoresProps) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState(NINGUNO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const nombreUn = useMemo(() => new Map(coordinadores.map((c) => [c.id, c.nombre])), [coordinadores]);
  const opcionesUn = [
    { value: NINGUNO, label: SIN_UN },
    ...coordinadores.map((c) => ({ value: String(c.id), label: c.nombre })),
  ];
  const sinUn = supervisores.filter((s) => s.coord_un_id === null);

  // Lo seleccionado que sigue en la lista (tras una recarga puede no estar).
  const elegidos = supervisores.filter((s) => seleccion.has(String(s.id)));

  const asignar = async (ids: number[], coordUn: string) => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const respuesta = await comisionesApi.asignarUnidad(ids, coordUn ? Number(coordUn) : null);
      setAviso(respuesta.message);
      router.reload({ only: ['supervisores'] });
      return true;
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar.'));
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const asignarSeleccion = async () => {
    if (await asignar(elegidos.map((s) => s.id), destino)) setSeleccion(new Set());
  };

  const columnas: Column<SupervisorUnidad>[] = [
    { header: 'Supervisor', accessor: (row) => nombre(row), sortKey: 'nombre', sticky: true },
    { header: 'Como supervisor (Odoo)', accessor: 'medio_supervisor', sortKey: 'medio_supervisor' },
    {
      header: 'Coordinador de UN',
      accessor: (row) => (
        <SelectMenu
          aria-label={`Coordinador de UN de ${nombre(row)}`}
          className="w-64"
          searchable
          disabled={guardando}
          value={row.coord_un_id === null ? NINGUNO : String(row.coord_un_id)}
          options={opcionesUn}
          onChange={(valor) => void asignar([row.id], valor)}
        />
      ),
      filterable: true,
      filterValue: (row) => (row.coord_un_id === null ? SIN_UN : nombreUn.get(row.coord_un_id) ?? SIN_UN),
    },
  ];

  // El resumen por coordinador, con los que no tienen al final.
  const porUnidad = [
    ...coordinadores.map((c) => ({
      clave: String(c.id),
      titulo: c.nombre,
      supervisores: supervisores.filter((s) => s.coord_un_id === c.id),
    })),
    { clave: 'sin', titulo: SIN_UN, supervisores: sinUn },
  ];

  return (
    <AppLayout>
      <StatusMessage
        status={error ? { type: 'error', text: error } : aviso ? { type: 'success', text: aviso } : null}
        className="mb-4"
        icon={error ? <AlertTriangle /> : <CheckCircle2 />}
      />

      <SummaryStrip
        columns={4}
        mono
        className="mb-6"
        items={[
          { id: 'sup', label: 'Supervisores', value: supervisores.length, tone: 'green' },
          { id: 'con', label: 'Con coordinador de UN', value: supervisores.length - sinUn.length, tone: 'blue' },
          {
            id: 'sin',
            label: 'Sin coordinador de UN',
            value: sinUn.length,
            tone: sinUn.length ? 'yellow' : 'slate',
            caption: 'Sus ventas no pagan a ningún coordinador de UN',
          },
          { id: 'un', label: 'Coordinadores de UN', value: coordinadores.length, tone: 'purple' },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <NeonContainer
            title="Supervisores"
            subtitle="El coordinador de UN cobra por las ventas de los supervisores que le responden. La oficina y el supervisor de cada venta salen de la propia ficha"
            icon={<UserCheck className="h-5 w-5" />}
            theme="green"
            noPadding
          >
            {elegidos.length === 0 ? (
              <p className="border-b border-slate-800 bg-surface-secondary/50 px-4 py-2 text-[11px] text-slate-500">
                Para asignar varios a la vez, márcalos (la casilla de la cabecera toma todos los filtrados) y elige el
                coordinador.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3 border-b border-sky-500/20 bg-sky-500/5 px-4 py-2.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">
                  {elegidos.length} seleccionado{elegidos.length === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-slate-400">Asignar a</span>
                <SelectMenu
                  aria-label="Coordinador de UN para la selección"
                  className="min-w-[220px] rounded-xl border border-slate-700/50 bg-surface-secondary px-3 py-1.5 text-xs text-white"
                  searchable
                  value={destino}
                  options={opcionesUn}
                  onChange={setDestino}
                />
                <Button size="sm" icon={<Compass className="h-4 w-4" />} isLoading={guardando} onClick={() => void asignarSeleccion()}>
                  Asignar {elegidos.length}
                </Button>
                <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => setSeleccion(new Set())}>
                  Quitar selección
                </Button>
              </div>
            )}
            <DataTable
              columns={columnas}
              data={supervisores}
              searchable
              searchPlaceholder="Buscar supervisor..."
              emptyMessage="No hay supervisores en el directorio de ventas (Catálogos › Ventas)."
              scrollClassName="max-h-[65vh]"
              selection={{ rowKey: (row) => String(row.id), selected: seleccion, onChange: setSeleccion }}
            />
          </NeonContainer>
        </div>

        <NeonContainer
          title="Por coordinador de UN"
          subtitle="Quién responde a cada uno"
          icon={<Compass className="h-5 w-5" />}
          theme="blue"
        >
          <div className="space-y-3">
            {porUnidad.map((u) => (
              <div
                key={u.clave}
                className={
                  u.clave === 'sin'
                    ? 'rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-3'
                    : 'rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-3'
                }
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={u.clave === 'sin' ? 'text-xs font-bold text-amber-200' : 'text-xs font-bold text-white'}>
                    {u.titulo}
                  </p>
                  <span className="rounded-full border border-slate-700/50 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {u.supervisores.length}
                  </span>
                </div>
                {u.supervisores.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Ninguno.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {u.supervisores.map((s) => (
                      <span
                        key={s.id}
                        className="rounded-lg border border-slate-700/50 bg-surface-primary px-2 py-1 text-[11px] text-slate-300"
                      >
                        {nombre(s)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </NeonContainer>
      </div>
    </AppLayout>
  );
}
