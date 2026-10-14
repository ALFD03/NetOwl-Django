/** Comisiones › Condiciones de pago: tramos, tarifas, días promocionales y los % PYME. */

import { useState, type ReactNode } from 'react';
import { router } from '@inertiajs/react';
import { AlertTriangle, CalendarRange, Crown, Plus, Save, Store, Trash2, Users } from 'lucide-react';

import { getApiErrorMessage } from '@/shared/lib/api/client';
import { comisionesApi } from '@/shared/lib/api/comisiones';
import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, NeonContainer, StatusMessage, TextField, type Column } from '@/shared/ui';
import { formatoMonto, formatoPct } from '../lib/formato';
import type { ComisionesCondicionesProps, CondicionesComision, PlanPyme, TramoAsesor } from '../types';

/**
 * Lo que cobraría un asesor con `ventas` ventas residenciales: vista previa
 * de los tramos mientras se editan. El cálculo que cuenta es el del servidor
 * (`reglas.pago_asesor`); esto solo enseña el efecto de la tabla.
 */
function previaAsesor(ventas: number, tramos: TramoAsesor[]): number {
  const ordenados = [...tramos].sort((a, b) => a.desde - b.desde);
  const tramo = ordenados.filter((t) => t.desde <= ventas).pop() ?? ordenados[0];
  return tramo ? Math.max(0, ventas - tramo.descontar) * tramo.monto : 0;
}

const CELDA = 'w-24 rounded border border-slate-700 bg-surface-tertiary px-2 py-1 text-right text-xs text-white';

function Numero({ value, onChange, min, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; min?: number; placeholder?: string;
}) {
  return (
    <input
      type="number"
      step="any"
      min={min}
      placeholder={placeholder}
      className={CELDA}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

function Fila({ children }: { children: ReactNode }) {
  return <tr className="border-b border-slate-800/60 last:border-0">{children}</tr>;
}

/**
 * Las condiciones no se versionan: un periodo cerrado guarda una copia de las
 * que usó, así que cambiarlas solo afecta a lo que se calcule después (los
 * borradores incluidos, que se recalculan al abrirlos).
 */
export function CondicionesView({ condiciones, planesPyme, puedeEditarPlanes }: ComisionesCondicionesProps) {
  const [draft, setDraft] = useState<CondicionesComision>(condiciones);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const cambiar = (patch: Partial<CondicionesComision>) => setDraft((d) => ({ ...d, ...patch }));
  const cambiarTramoAsesor = (i: number, patch: Partial<TramoAsesor>) =>
    cambiar({ tramos_asesor: draft.tramos_asesor.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const cambiarTramoUn = (i: number, patch: Partial<CondicionesComision['tramos_un'][number]>) =>
    cambiar({ tramos_un: draft.tramos_un.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const guardar = async () => {
    setGuardando(true);
    setEstado(null);
    try {
      const respuesta = await comisionesApi.guardarCondiciones({ ...draft });
      setEstado({ type: 'success', text: respuesta.message });
      router.reload({ only: ['condiciones'] });
    } catch (err: unknown) {
      setEstado({ type: 'error', text: getApiErrorMessage(err, 'No se pudieron guardar las condiciones.') });
    } finally {
      setGuardando(false);
    }
  };

  const columnasPyme: Column<PlanPyme>[] = [
    { header: 'Plan', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Tarifa', accessor: (row) => row.tarifa || '—' },
    { header: 'Precio', accessor: (row) => formatoMonto(row.precio), align: 'right', sortKey: 'precio' },
    {
      header: 'Comisión',
      align: 'right',
      accessor: (row) => (row.comision_pyme_pct === null
        ? <span className="text-amber-400">sin definir</span>
        : formatoPct(row.comision_pyme_pct)),
    },
    {
      header: 'Por venta',
      align: 'right',
      accessor: (row) => (row.comision_pyme_pct === null ? '—' : formatoMonto((row.precio * row.comision_pyme_pct) / 100)),
    },
  ];

  const sinPct = planesPyme.filter((p) => p.comision_pyme_pct === null).length;

  return (
    <AppLayout
      toolbar={
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
          <p className="text-xs text-slate-400">
            Los cambios valen para lo que se calcule desde ahora; un periodo cerrado conserva las condiciones con que se cerró.
          </p>
          <Button icon={<Save className="h-4 w-4" />} isLoading={guardando} onClick={() => void guardar()}>
            Guardar condiciones
          </Button>
        </div>
      }
    >
      <StatusMessage status={estado} className="mb-4" icon={<AlertTriangle />} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <NeonContainer
          title="Asesores de venta"
          subtitle="Por tramos de ventas residenciales. Se pagan (ventas − descontar) × monto"
          icon={<Users className="h-5 w-5" />}
          theme="blue"
        >
          <table className="w-full text-xs text-slate-300">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 text-left">Desde (ventas)</th>
                <th className="py-2 text-right">Monto por venta</th>
                <th className="py-2 text-right">Descontar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.tramos_asesor.map((tramo, i) => (
                <Fila key={i}>
                  <td className="py-2"><Numero value={tramo.desde} min={0} onChange={(v) => cambiarTramoAsesor(i, { desde: v ?? 0 })} /></td>
                  <td className="py-2 text-right"><Numero value={tramo.monto} min={0} onChange={(v) => cambiarTramoAsesor(i, { monto: v ?? 0 })} /></td>
                  <td className="py-2 text-right"><Numero value={tramo.descontar} min={0} onChange={(v) => cambiarTramoAsesor(i, { descontar: v ?? 0 })} /></td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      title="Quitar tramo"
                      className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                      onClick={() => cambiar({ tramos_asesor: draft.tramos_asesor.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </Fila>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex justify-between gap-3">
            <Button
              size="sm"
              variant="outline"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => cambiar({ tramos_asesor: [...draft.tramos_asesor, { desde: 0, monto: 0, descontar: 0 }] })}
            >
              Añadir tramo
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-400">
            {[5, 6, 19, 20, 21, 25, 26, 30].map((n) => (
              <span key={n} className="rounded-full border border-slate-800 px-2 py-1">
                {n} ventas → <strong className="text-white">{formatoMonto(previaAsesor(n, draft.tramos_asesor))}</strong>
              </span>
            ))}
          </div>
        </NeonContainer>

        <NeonContainer
          title="Coordinadores de unidad de negocio"
          subtitle="Por venta de su equipo, según el crecimiento del mes de sus unidades"
          icon={<Crown className="h-5 w-5" />}
          theme="purple"
        >
          <table className="w-full text-xs text-slate-300">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 text-left">Crecimiento desde</th>
                <th className="py-2 text-right">Monto por venta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.tramos_un.map((tramo, i) => (
                <Fila key={i}>
                  <td className="py-2">
                    {tramo.desde_pct === null && i === 0
                      ? <span className="text-slate-400">cualquier crecimiento</span>
                      : <Numero value={tramo.desde_pct} placeholder="%" onChange={(v) => cambiarTramoUn(i, { desde_pct: v })} />}
                  </td>
                  <td className="py-2 text-right"><Numero value={tramo.monto} min={0} onChange={(v) => cambiarTramoUn(i, { monto: v ?? 0 })} /></td>
                  <td className="py-2 text-right">
                    {i > 0 && (
                      <button
                        type="button"
                        title="Quitar tramo"
                        className="rounded p-1 text-rose-400 hover:bg-rose-500/10"
                        onClick={() => cambiar({ tramos_un: draft.tramos_un.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </Fila>
              ))}
            </tbody>
          </table>
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => cambiar({ tramos_un: [...draft.tramos_un, { desde_pct: 0, monto: 0 }] })}
            >
              Añadir tramo
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Venta propia del coordinador de UN ($)"
              type="number"
              step="any"
              min={0}
              value={draft.monto_directa_un}
              onChange={(e) => cambiar({ monto_directa_un: Number(e.target.value) })}
            />
          </div>
        </NeonContainer>

        <NeonContainer
          title="Supervisores y coordinadores de oficina"
          subtitle="Por venta de su equipo y por venta propia; el total por el % de cumplimiento del objetivo (tope 100%)"
          icon={<Store className="h-5 w-5" />}
          theme="green"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Venta de su equipo ($)"
              type="number"
              step="any"
              min={0}
              value={draft.monto_equipo}
              onChange={(e) => cambiar({ monto_equipo: Number(e.target.value) })}
            />
            <TextField
              label="Venta propia ($)"
              type="number"
              step="any"
              min={0}
              value={draft.monto_directa}
              onChange={(e) => cambiar({ monto_directa: Number(e.target.value) })}
            />
          </div>
        </NeonContainer>

        <NeonContainer
          title="Periodo"
          subtitle="Dónde se corta cada periodo y cuánto se espera para calcularlo"
          icon={<CalendarRange className="h-5 w-5" />}
          theme="slate"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Día habitual de inicio de los días promocionales"
              type="number"
              min={1}
              max={31}
              value={draft.dia_promocional}
              onChange={(e) => cambiar({ dia_promocional: Number(e.target.value) })}
            />
            <TextField
              label="Días de espera tras el fin del mes"
              type="number"
              min={0}
              max={60}
              value={draft.dias_espera}
              onChange={(e) => cambiar({ dias_espera: Number(e.target.value) })}
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            El día promocional es solo la propuesta: cada periodo confirma el suyo al crearlo, porque se adelantan o se retrasan.
          </p>
        </NeonContainer>
      </div>

      <NeonContainer
        title="Planes PYME"
        subtitle={
          sinPct
            ? `${sinPct} plan(es) sin % de comisión: sus ventas salen en el informe sin monto`
            : 'Lo que cobra quien vende cada plan, y solo esa persona'
        }
        icon={<Store className="h-5 w-5" />}
        theme={sinPct ? 'yellow' : 'slate'}
        noPadding
        className="mt-6"
        headerAction={puedeEditarPlanes ? (
          <a href="/catalogos/productos/" className="text-xs text-sky-400 hover:underline">Editar en Catálogos › Productos</a>
        ) : undefined}
      >
        <DataTable columns={columnasPyme} data={planesPyme} searchable searchPlaceholder="Buscar plan..." emptyMessage="No hay planes PYME en el catálogo." />
      </NeonContainer>
    </AppLayout>
  );
}
