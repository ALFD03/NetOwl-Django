/** Los planes PYME y su % de comisión, de solo lectura: se editan en el catálogo de productos. */

import { useMemo, useState } from 'react';
import { Briefcase } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { DataTable, NeonContainer, Panel, ToggleGroup, type Column } from '@/shared/ui';
import { formatoMonto, formatoPct } from '../../lib/formato';
import type { PlanPyme } from '../../types';

const ENLACE = '/catalogos/productos/';

const columnas: Column<PlanPyme>[] = [
  {
    header: 'Plan',
    accessor: (row) => (
      <span className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', row.comision_pyme_pct === null ? 'bg-amber-500' : 'bg-slate-700')} aria-hidden />
        <span className="font-semibold text-white">{row.nombre}</span>
      </span>
    ),
    sortKey: 'nombre',
  },
  { header: 'Tarifa', accessor: (row) => row.tarifa || '—' },
  { header: 'Precio', accessor: (row) => formatoMonto(row.precio), align: 'right', sortKey: 'precio' },
  {
    header: 'Comisión',
    align: 'right',
    accessor: (row) => (row.comision_pyme_pct === null
      ? <span className="font-semibold text-amber-400">sin definir</span>
      : formatoPct(row.comision_pyme_pct)),
  },
  {
    header: 'Por venta',
    align: 'right',
    accessor: (row) => (row.comision_pyme_pct === null ? '—' : formatoMonto((row.precio * row.comision_pyme_pct) / 100)),
  },
];

export function PlanesPymeCard({
  planes, puedeEditarPlanes, compacto,
}: {
  planes: PlanPyme[];
  puedeEditarPlanes: boolean;
  /** En la edición de condiciones: solo un recordatorio de dónde se editan. */
  compacto: boolean;
}) {
  const [filtro, setFiltro] = useState<'todos' | 'sin'>('todos');
  const sinPct = planes.filter((p) => p.comision_pyme_pct === null).length;
  // Los que no cobran nada primero: son lo que hay que resolver.
  const ordenados = useMemo(
    () => [...planes].sort((a, b) => Number(b.comision_pyme_pct === null) - Number(a.comision_pyme_pct === null) || a.nombre.localeCompare(b.nombre)),
    [planes],
  );
  const visibles = filtro === 'sin' ? ordenados.filter((p) => p.comision_pyme_pct === null) : ordenados;
  const enlace = puedeEditarPlanes ? <a href={ENLACE} className="text-xs text-sky-400 hover:underline">Editar en Catálogos › Productos</a> : null;

  if (compacto) {
    return (
      <Panel title="Planes PYME" actions={enlace}>
        <p className="text-xs text-slate-400">
          Su % de comisión se edita en el catálogo de productos, no aquí
          {sinPct ? ` · ${sinPct} ${sinPct === 1 ? 'plan' : 'planes'} sin definir` : ''}.
        </p>
      </Panel>
    );
  }

  return (
    <NeonContainer
      title="Planes PYME"
      subtitle={sinPct
        ? `${sinPct} ${sinPct === 1 ? 'plan' : 'planes'} sin % de comisión: sus ventas salen en el informe sin monto`
        : 'Lo que cobra quien vende cada plan, y solo esa persona'}
      icon={<Briefcase className="h-5 w-5" />}
      theme={sinPct ? 'yellow' : 'slate'}
      noPadding
      headerAction={(
        <div className="flex flex-wrap items-center gap-3">
          {sinPct > 0 && (
            <ToggleGroup
              options={[
                { key: 'todos', label: `Todos (${planes.length})` },
                { key: 'sin', label: `Sin % (${sinPct})` },
              ]}
              activeKey={filtro}
              onChange={(key) => setFiltro(key as 'todos' | 'sin')}
            />
          )}
          {enlace}
        </div>
      )}
    >
      <DataTable columns={columnas} data={visibles} searchable searchPlaceholder="Buscar plan..." emptyMessage="No hay planes PYME en el catálogo." />
    </NeonContainer>
  );
}
