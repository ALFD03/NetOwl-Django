/** Los planes PYME y su % de comisión, de solo lectura: se editan en el catálogo de productos. */

import { useMemo, useState } from 'react';
import { Briefcase } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { DataTable, NeonContainer, Panel, ToggleGroup, type Column } from '@/shared/ui';
import { formatAmount, formatPctValue } from '../../lib/format';
import type { PlanPyme } from '../../types';

const ENLACE = '/catalogos/productos/';

const columns: Column<PlanPyme>[] = [
  {
    header: 'Plan',
    accessor: (row) => (
      <span className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', row.sme_commission_pct === null ? 'bg-amber-500' : 'bg-slate-700')} aria-hidden />
        <span className="font-semibold text-white">{row.name}</span>
      </span>
    ),
    sortKey: 'name',
  },
  { header: 'Tarifa', accessor: (row) => row.tariff || '—' },
  { header: 'Precio', accessor: (row) => formatAmount(row.price), align: 'right', sortKey: 'price' },
  {
    header: 'Comisión',
    align: 'right',
    accessor: (row) => (row.sme_commission_pct === null
      ? <span className="font-semibold text-amber-400">sin definir</span>
      : formatPctValue(row.sme_commission_pct)),
  },
  {
    header: 'Por venta',
    align: 'right',
    accessor: (row) => (row.sme_commission_pct === null ? '—' : formatAmount((row.price * row.sme_commission_pct) / 100)),
  },
];

export function SmePlansCard({
  planes, canEditPlans, compacto,
}: {
  planes: PlanPyme[];
  canEditPlans: boolean;
  /** En la edición de condiciones: solo un recordatorio de dónde se editan. */
  compacto: boolean;
}) {
  const [filtro, setFilter] = useState<'todos' | 'sin'>('todos');
  const withoutPct = planes.filter((p) => p.sme_commission_pct === null).length;
  // Los que no cobran nada primero: son lo que hay que resolver.
  const ordenados = useMemo(
    () => [...planes].sort((a, b) => Number(b.sme_commission_pct === null) - Number(a.sme_commission_pct === null) || a.name.localeCompare(b.name)),
    [planes],
  );
  const visibles = filtro === 'sin' ? ordenados.filter((p) => p.sme_commission_pct === null) : ordenados;
  const enlace = canEditPlans ? <a href={ENLACE} className="text-xs text-sky-400 hover:underline">Editar en Catálogos › Productos</a> : null;

  if (compacto) {
    return (
      <Panel title="Planes PYME" actions={enlace}>
        <p className="text-xs text-slate-400">
          Su % de comisión se edita en el catálogo de productos, no aquí
          {withoutPct ? ` · ${withoutPct} ${withoutPct === 1 ? 'plan' : 'planes'} sin definir` : ''}.
        </p>
      </Panel>
    );
  }

  return (
    <NeonContainer
      title="Planes PYME"
      subtitle={withoutPct
        ? `${withoutPct} ${withoutPct === 1 ? 'plan' : 'planes'} sin % de comisión: sus ventas salen en el informe sin monto`
        : 'Lo que cobra quien vende cada plan, y solo esa persona'}
      icon={<Briefcase className="h-5 w-5" />}
      theme={withoutPct ? 'yellow' : 'slate'}
      noPadding
      headerAction={(
        <div className="flex flex-wrap items-center gap-3">
          {withoutPct > 0 && (
            <ToggleGroup
              options={[
                { key: 'todos', label: `Todos (${planes.length})` },
                { key: 'sin', label: `Sin % (${withoutPct})` },
              ]}
              activeKey={filtro}
              onChange={(key) => setFilter(key as 'todos' | 'sin')}
            />
          )}
          {enlace}
        </div>
      )}
    >
      <DataTable columns={columns} data={visibles} searchable searchPlaceholder="Buscar plan..." emptyMessage="No hay planes PYME en el catálogo." />
    </NeonContainer>
  );
}
