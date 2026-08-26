import { useState } from 'react';
import { AlertOctagon, Building2, Layers, Wrench } from 'lucide-react';

import { DataTable, EmptyState, NeonContainer, StatTile, ToggleGroup } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import type { SupportBreakdownKey, SupportBreakdownRow, SupportSolutionRow } from '../../types';
import { SUPPORT_BREAKDOWN_COLUMNS, SUPPORT_SOLUTION_COLUMNS } from './supportBreakdownColumns';

const TABS: Array<{ key: SupportBreakdownKey; label: string; icon: JSX.Element; noun: string }> = [
  { key: 'razones', label: 'Razones', icon: <AlertOctagon className="h-4 w-4" />, noun: 'razón de falla' },
  { key: 'soluciones', label: 'Soluciones', icon: <Wrench className="h-4 w-4" />, noun: 'solución' },
  { key: 'tipos', label: 'Tipos', icon: <Layers className="h-4 w-4" />, noun: 'tipo de solicitud' },
  { key: 'sucursales', label: 'Sucursales', icon: <Building2 className="h-4 w-4" />, noun: 'sucursal' },
];

/** The four leaders of the active tab, as a strip above the full table. */
interface TopItem {
  nombre: string;
  value: string;
  caption: string;
}

interface Props {
  razones: SupportBreakdownRow[];
  soluciones: SupportSolutionRow[];
  tipos: SupportBreakdownRow[];
  sucursales: SupportBreakdownRow[];
}

/**
 * The four ways the group's tickets can be sliced, one tab each.
 *
 * Solutions are counted rather than analysed, so that tab carries its own
 * columns; the other three share the dimension metric block.
 */
export function SupportBreakdownPanel({ razones, soluciones, tipos, sucursales }: Props) {
  const [activeTab, setActiveTab] = useState<SupportBreakdownKey>('razones');

  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const isSolutions = activeTab === 'soluciones';

  const rows: SupportBreakdownRow[] =
    activeTab === 'tipos' ? tipos : activeTab === 'sucursales' ? sucursales : razones;

  const count = isSolutions ? soluciones.length : rows.length;

  const top: TopItem[] = isSolutions
    ? soluciones.slice(0, 4).map((row) => ({
        nombre: row.nombre,
        value: `${formatTwoDecimals(row.pct)}%`,
        caption: `${formatInteger(row.total)} tickets`,
      }))
    : rows.slice(0, 4).map((row) => ({
        nombre: row.nombre,
        value: `${formatTwoDecimals(row.pctDelGrupo)}%`,
        caption: `${formatInteger(row.total_tickets)} tickets`,
      }));

  return (
    <NeonContainer
      theme="purple"
      title="Desglose del Grupo"
      subtitle={`${count} valores · ordenados por volumen`}
      icon={tab.icon}
      headerAction={
        <ToggleGroup
          className="flex-wrap"
          options={TABS.map(({ key, label, icon }) => ({ key, label, icon }))}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as SupportBreakdownKey)}
        />
      }
    >
      {count === 0 ? (
        <EmptyState
          title={`El grupo no registra ninguna ${tab.noun} en el periodo.`}
          description="Vuelve a ejecutar el análisis del mes si esperabas ver datos aquí."
          icon={tab.icon}
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {top.map((item) => (
              <StatTile
                key={item.nombre}
                label={item.nombre}
                value={item.value}
                caption={item.caption}
                tone="brand"
                variant="boxed"
                mono
              />
            ))}
          </div>

          <div className="h-[480px]">
            {isSolutions ? (
              <DataTable
                columns={SUPPORT_SOLUTION_COLUMNS}
                data={soluciones}
                searchable
                searchPlaceholder="Buscar solución..."
              />
            ) : (
              <DataTable
                columns={SUPPORT_BREAKDOWN_COLUMNS}
                data={rows}
                searchable
                searchPlaceholder={`Buscar ${tab.noun}...`}
              />
            )}
          </div>
        </>
      )}
    </NeonContainer>
  );
}
