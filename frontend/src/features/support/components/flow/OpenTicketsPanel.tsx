/**
 * Los tickets abiertos hoy: cuánto llevan abiertos y cuánto en su etapa actual.
 * Es una sección del Dashboard de soporte.
 *
 * Es la foto de ahora (hora de Caracas) con los logs cargados en el último
 * análisis: no tiene mes. Un ticket que los logs dan por abierto y el export de
 * tickets ya da por cerrado no se cuenta —le faltan sus últimos logs— y se dice
 * cuántos son, porque un lote sin cargar hace que todo parezca más viejo.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, FolderOpen, Hourglass, Layers, ListOrdered } from 'lucide-react';

import { BarChart } from '@/shared/charts';
import {
  DataTable,
  EmptyState,
  ExcelExportButton,
  MetricCard,
  NeonContainer,
  ProgressBar,
  StatusMessage,
  StickyLabel,
  ToggleGroup,
  type Column,
} from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';
import { ageChartData, ageChartOptions } from '../../lib/flowCharts';
import {
  TEAM_LABEL,
  KIND_LABEL,
  formatDuration,
  formatExactHours,
} from '../../lib/flowFormat';
import type { OpenGroup, OpenTicket, OpenTickets } from '../../types';

type Grouping = 'by_stage' | 'by_group' | 'by_assignee' | 'by_request_type' | 'by_zone';

const GROUPINGS: { key: Grouping; label: string; field: keyof OpenGroup }[] = [
  { key: 'by_stage', label: 'Etapa', field: 'current_stage' },
  { key: 'by_group', label: 'Grupo de trabajo', field: 'grupo_trabajo' },
  { key: 'by_assignee', label: 'Asignado a', field: 'asignado_a' },
  { key: 'by_request_type', label: 'Tipo', field: 'tipo_solicitud' },
  { key: 'by_zone', label: 'Zona', field: 'zona' },
];

const Duration = ({
  hours,
  strong = false,
}: {
  hours: number | null | undefined;
  strong?: boolean;
}) => (
  <span
    title={formatExactHours(hours)}
    className={strong ? 'font-black text-amber-400' : undefined}
  >
    {formatDuration(hours)}
  </span>
);

function groupColumns(field: keyof OpenGroup, label: string): Column<OpenGroup>[] {
  const columns: Column<OpenGroup>[] = [
    {
      header: label,
      accessor: (r) => <StickyLabel minWidth="180px">{String(r[field] ?? '—')}</StickyLabel>,
      sortKey: field,
      sticky: true,
    },
  ];
  if (field === 'current_stage') {
    columns.push(
      {
        header: 'Equipo',
        accessor: (r) => (r.current_team ? TEAM_LABEL[r.current_team] : '—'),
        sortKey: 'current_team',
        filterable: true,
        filterValue: (r) => (r.current_team ? TEAM_LABEL[r.current_team] : '—'),
      },
      {
        header: 'Tipo',
        accessor: (r) => (r.current_type ? KIND_LABEL[r.current_type] : '—'),
        sortKey: 'current_type',
        filterable: true,
        filterValue: (r) => (r.current_type ? KIND_LABEL[r.current_type] : '—'),
      },
    );
  }
  columns.push(
    {
      header: 'Abiertos',
      accessor: (r) => formatInteger(r.open),
      align: 'right',
      sortKey: 'open',
    },
    {
      header: 'Escalados',
      accessor: (r) => formatInteger(r.escalated),
      align: 'right',
      sortKey: 'escalated',
    },
    {
      header: 'Abierto hace (prom.)',
      accessor: (r) => <Duration hours={r.age_mean} strong />,
      align: 'right',
      sortKey: 'age_mean',
    },
    {
      header: 'Abierto hace (mediana)',
      accessor: (r) => <Duration hours={r.age_median} />,
      align: 'right',
      sortKey: 'age_median',
    },
    {
      header: 'El más viejo',
      accessor: (r) => <Duration hours={r.age_max} />,
      align: 'right',
      sortKey: 'age_max',
    },
    {
      header: 'En su etapa (prom.)',
      accessor: (r) => <Duration hours={r.in_stage_mean} />,
      align: 'right',
      sortKey: 'in_stage_mean',
    },
    {
      header: 'En su etapa (mediana)',
      accessor: (r) => <Duration hours={r.in_stage_median} />,
      align: 'right',
      sortKey: 'in_stage_median',
    },
  );
  return columns;
}

const LIST_COLUMNS: Column<OpenTicket>[] = [
  {
    header: 'Ticket',
    accessor: (r) => <StickyLabel minWidth="110px">{r.ticket}</StickyLabel>,
    sortKey: 'ticket',
    sticky: true,
  },
  { header: 'Etapa', accessor: 'stage', sortKey: 'stage', filterable: true },
  {
    header: 'Equipo',
    accessor: (r) => TEAM_LABEL[r.team],
    sortKey: 'team',
    filterable: true,
    filterValue: (r) => TEAM_LABEL[r.team],
  },
  { header: 'Grupo', accessor: 'grupo_trabajo', sortKey: 'grupo_trabajo', filterable: true },
  { header: 'Asignado a', accessor: 'asignado_a', sortKey: 'asignado_a' },
  {
    header: 'Escalado',
    accessor: (r) => (r.is_escalated ? 'Sí' : '—'),
    sortKey: 'is_escalated',
    filterable: true,
    filterValue: (r) => (r.is_escalated ? 'Sí' : 'No'),
  },
  {
    header: 'Creado',
    accessor: (r) => (r.opened_at ? r.opened_at.replace('T', ' ').slice(0, 16) : '—'),
    sortKey: 'opened_at',
  },
  {
    header: 'Abierto hace',
    accessor: (r) => <Duration hours={r.age_h} strong />,
    align: 'right',
    sortKey: 'age_h',
  },
  {
    header: 'En su etapa',
    accessor: (r) => <Duration hours={r.in_stage_h} />,
    align: 'right',
    sortKey: 'in_stage_h',
  },
];

const EXCEL_LIST = [
  { header: 'Ticket', value: (r: OpenTicket) => r.ticket, width: 14 },
  { header: 'Etapa', value: (r: OpenTicket) => r.stage, width: 30 },
  { header: 'Equipo', value: (r: OpenTicket) => TEAM_LABEL[r.team], width: 10 },
  { header: 'Tipo de etapa', value: (r: OpenTicket) => KIND_LABEL[r.type], width: 14 },
  { header: 'Grupo de trabajo', value: (r: OpenTicket) => r.grupo_trabajo, width: 26 },
  { header: 'Asignado a', value: (r: OpenTicket) => r.asignado_a, width: 26 },
  { header: 'Tipo', value: (r: OpenTicket) => r.tipo_solicitud, width: 18 },
  { header: 'Zona', value: (r: OpenTicket) => r.zona, width: 18 },
  { header: 'Escalado', value: (r: OpenTicket) => (r.is_escalated ? 'Sí' : 'No'), width: 10 },
  {
    header: 'Creado',
    value: (r: OpenTicket) => r.opened_at?.replace('T', ' ').slice(0, 16) ?? '',
    width: 18,
  },
  { header: 'Horas abierto', value: (r: OpenTicket) => r.age_h, format: '0.00', width: 14 },
  {
    header: 'Horas en su etapa',
    value: (r: OpenTicket) => r.in_stage_h,
    format: '0.00',
    width: 16,
  },
];

function Summary({ data }: { data: OpenTickets }) {
  const { summary } = data;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <MetricCard
        label="Abiertos"
        value={formatInteger(summary.open)}
        color="slate"
        subValue={`ATC ${formatInteger(summary.in_atc)} · Soporte ${formatInteger(summary.in_support)}`}
      />
      <MetricCard
        label="Escalados abiertos"
        value={formatInteger(summary.escalated)}
        color="purple"
        subValue={`En Soporte desde el escalamiento: ${formatDuration(summary.in_support_since_escalation.sample ? summary.in_support_since_escalation.mean : null)} (prom.)`}
      />
      <MetricCard
        label="Abierto hace (promedio)"
        value={formatDuration(summary.age.sample ? summary.age.mean : null)}
        color="yellow"
        subValue={`Mediana ${formatDuration(summary.age.median)}`}
      />
      <MetricCard
        label="La cuarta parte más vieja"
        value={`> ${formatDuration(summary.age.p75)}`}
        color="red"
        subValue={`El más viejo: ${formatDuration(summary.age.max)}`}
      />
      <MetricCard
        label="En su etapa actual (prom.)"
        value={formatDuration(summary.in_stage.sample ? summary.in_stage.mean : null)}
        color="blue"
        subValue={`Mediana ${formatDuration(summary.in_stage.median)}`}
      />
      <MetricCard
        label="Logs cargados hasta"
        value={data.logs_until ? data.logs_until.slice(0, 10) : '—'}
        color="slate"
        subValue={`Reloj: ${data.now.replace('T', ' ').slice(0, 16)} (Caracas)`}
      />
    </div>
  );
}

/** Dónde están hoy: las etapas con más abiertos, con su parte del total. */
function WhereTheyAre({ data }: { data: OpenTickets }) {
  const total = data.summary.open;
  const stages = [...data.by_stage].sort((a, b) => b.open - a.open).slice(0, 7);
  return (
    <div className="space-y-3">
      {stages.map((e) => {
        const part = total > 0 ? Math.round((e.open / total) * 1000) / 10 : 0;
        return (
          <ProgressBar
            key={e.current_stage ?? '—'}
            label={`${e.current_stage ?? '—'} · ${formatInteger(e.open)}${e.current_team ? ` · ${TEAM_LABEL[e.current_team]}` : ''}`}
            percent={part}
            valueLabel={`${part}% · ${formatDuration(e.age_mean)}`}
            color={e.current_team === 'soporte' ? 'purple' : 'blue'}
          />
        );
      })}
      {data.by_stage.length > stages.length && (
        <p className="text-[11px] text-slate-500">Las demás etapas, en la tabla de abajo.</p>
      )}
    </div>
  );
}

/**
 * Los tickets abiertos ahora (hora de Caracas), con los logs del último análisis.
 * Es la sección del Dashboard: no tiene mes.
 */
export function OpenTicketsPanel({ open }: { open: OpenTickets | null }) {
  const [grouping, setGrouping] = useState<Grouping>('by_stage');
  const chart = useMemo(
    () => (open ? ageChartData(open.aging) : null),
    [open],
  );

  if (!open) {
    return (
      <EmptyState
        title="Todavía no hay recorrido de tickets"
        description="Carga los logs de etapa en Importaciones › Soporte técnico y ejecuta el análisis de soporte."
        icon={<FolderOpen />}
        size="md"
        bordered
      />
    );
  }

  const active = GROUPINGS.find((a) => a.key === grouping) ?? GROUPINGS[0];
  const empty = open.summary.open === 0;

  return (
    <div className="space-y-6">
      {open.summary.stale > 0 && (
        <StatusMessage
          icon={<AlertTriangle />}
          status={{
            type: 'warning',
            text: `${formatInteger(open.summary.stale)} tickets siguen abiertos según los logs pero el export de tickets ya los da por cerrados: no se cuentan. Carga el lote de logs más reciente y vuelve a ejecutar el análisis.`,
          }}
        />
      )}

      <Summary data={open} />

      {empty || !chart ? (
        <EmptyState title="No hay tickets abiertos" icon={<FolderOpen />} size="md" bordered />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <NeonContainer
              theme="cyan"
              title="Antigüedad"
              subtitle="Cuánto llevan abiertos los tickets abiertos hoy"
              icon={<Clock className="h-5 w-5" />}
              className="xl:col-span-3"
            >
              <BarChart data={chart} options={ageChartOptions} className="h-72 w-full" />
            </NeonContainer>
            <NeonContainer
              theme="yellow"
              title="Dónde están"
              subtitle="Las etapas con más abiertos y su antigüedad promedio"
              icon={<Hourglass className="h-5 w-5" />}
              className="xl:col-span-2"
            >
              <WhereTheyAre data={open} />
            </NeonContainer>
          </div>

          <NeonContainer
            theme="slate"
            title={`Abiertos por ${active.label.toLowerCase()}`}
            subtitle="Dónde se acumulan y cuánto llevan"
            icon={<Layers className="h-5 w-5" />}
            headerAction={
              <div className="rounded-2xl border border-slate-800 bg-surface-primary p-1">
                <ToggleGroup
                  options={GROUPINGS.map((a) => ({ key: a.key, label: a.label }))}
                  activeKey={grouping}
                  onChange={(k) => setGrouping(k as Grouping)}
                />
              </div>
            }
            noPadding
          >
            <DataTable
              columns={groupColumns(active.field, active.label)}
              data={open[grouping]}
              searchable
              searchPlaceholder="Buscar..."
              emptyMessage="No hay tickets abiertos."
            />
          </NeonContainer>

          <NeonContainer
            theme="red"
            title="Los más antiguos"
            subtitle={`Los ${formatInteger(open.items.length)} abiertos hace más tiempo${open.summary.open > open.items_limit ? ` (de ${formatInteger(open.summary.open)})` : ''}`}
            icon={<ListOrdered className="h-5 w-5" />}
            headerAction={
              <ExcelExportButton
                rows={open.items}
                columns={EXCEL_LIST}
                fileName="tickets-abiertos"
                sheetName="Abiertos"
              />
            }
            noPadding
          >
            <DataTable
              columns={LIST_COLUMNS}
              data={open.items}
              searchable
              searchPlaceholder="Buscar ticket, asignado..."
            />
          </NeonContainer>
        </>
      )}
    </div>
  );
}
