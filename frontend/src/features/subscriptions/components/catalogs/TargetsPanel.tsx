/**
 * La pestaña de objetivos del catálogo: el general y el semáforo como
 * métricas, las excepciones por mes y los objetivos propios de zonas, sites,
 * estados y coordinadores.
 *
 * Solo edita. Quien aplica los objetivos es el cliente de cada reporte
 * (`lib/targets.ts`); aquí se usa esa misma función para enseñar el objetivo
 * efectivo de cada mes, así que lo que dice esta tabla es lo que verá el reporte.
 */

import type { ReactNode } from 'react';
import { CalendarRange, Edit3, Globe2, Layers, Plus, Target, Trash2, TrafficCone, TrendingDown } from 'lucide-react';

import { Button, DataTable, EmptyState, MetricCard, NeonContainer, type Column } from '@/shared/ui';
import { formatPeriodLabel } from '@/shared/utils/formatters';
import {
  DEFAULT_TARGETS,
  createResolver,
  formatTarget,
  monthOf,
  overallTarget,
} from '../../lib/targets';
import type {
  CatalogTarget,
  CatalogMonthTarget,
  CatalogTrafficLight,
  CatalogZone,
  KnownNode,
  TargetsConfig,
} from '../../types';
import { TrafficLightScale } from './TrafficLightScale';
import { TARGET_LEVEL_UI } from '../targets/levels';

export interface TargetsPanelProps {
  targets: CatalogTarget[];
  monthTargets: CatalogMonthTarget[];
  thresholds: CatalogTrafficLight | null;
  config: TargetsConfig | null;
  /** Meses con cierre calculado, `YYYY-MM`. */
  periods: string[];
  /** El catálogo de zonas: dice a qué coordinador, site y estado pertenece cada una. */
  zones: CatalogZone[];
  /** Los nodos de los datos: a cuáles alcanza cada objetivo. */
  nodes: KnownNode[];
  onEditGeneral: (row: CatalogTarget) => void;
  onNewTarget: () => void;
  onEditTarget: (row: CatalogTarget) => void;
  onDeleteTarget: (row: CatalogTarget) => void;
  onMonthException: (period: string, existing?: CatalogMonthTarget) => void;
  onDeleteMonth: (row: CatalogMonthTarget) => void;
  onEditTrafficLight: () => void;
}

/** Un porcentaje de objetivo, o "hereda" si el tramo no lo fija. */
const value = (pct: number | null): ReactNode =>
  pct === null ? <span className="text-slate-500">hereda</span> : formatTarget(pct);

interface MonthRow {
  period: string;
  computed: boolean;
  exception?: CatalogMonthTarget;
}

function IconButton({
  onClick, title, tone, children,
}: { onClick: () => void; title: string; tone: 'sky' | 'rose'; children: ReactNode }) {
  const classes = tone === 'sky'
    ? 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10'
    : 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10';
  return (
    <button type="button" onClick={onClick} title={title} className={`rounded-lg border p-2 ${classes}`}>
      {children}
    </button>
  );
}

export function TargetsPanel({
  targets,
  monthTargets,
  thresholds,
  config,
  periods,
  zones,
  nodes,
  onEditGeneral,
  onNewTarget,
  onEditTarget,
  onDeleteTarget,
  onMonthException,
  onDeleteMonth,
  onEditTrafficLight,
}: TargetsPanelProps) {
  const cfg = config ?? DEFAULT_TARGETS;
  const s = thresholds ?? DEFAULT_TARGETS.thresholds;

  // Con la misma resolución que los reportes, para decir de cada objetivo en
  // qué nodos rige y en cuáles lo anula un nivel superior. Se mide en el mes
  // más reciente calculado.
  const referenceMonth = periods[0] ?? new Date().toISOString().slice(0, 7);
  const zoneOf = new Map(zones.map((z) => [z.name.toLowerCase(), z]));
  const resolve = createResolver(
    cfg,
    zones.map((z) => ({ name: z.name, site: z.site, type: z.technology, coordinator: z.coordinator, state: z.state })),
  );

  /** Los nodos de los datos a los que alcanza un objetivo. */
  const nodesOf = (row: CatalogTarget): KnownNode[] => {
    const sameValue = (a: string | undefined, b: string) => (a ?? '').toLowerCase() === b.toLowerCase();
    return nodes.filter((n) => {
      const zone = zoneOf.get(n.zona.toLowerCase());
      switch (row.level) {
        case 'zona_sucursal': return sameValue(n.node, row.entity);
        case 'zona': return sameValue(n.zona, row.entity);
        case 'sucursal': return sameValue(n.sucursal, row.entity);
        case 'coordinador': return sameValue(zone?.coordinator, row.entity);
        case 'site': return sameValue(zone?.site, row.entity);
        case 'estado': return sameValue(zone?.state, row.entity);
        default: return false;
      }
    });
  };

  /** Qué rige hoy en los nodos que alcanza el objetivo, por cada métrica que fija. */
  const effectiveToday = (row: CatalogTarget): ReactNode => {
    const scope = nodesOf(row);
    if (scope.length === 0) return <span className="text-slate-600">Sin nodos en los datos</span>;

    const lines = (['growth', 'churn'] as const)
      .filter((metric) => row[`${metric}_pct`] !== null)
      .flatMap((metric) => {
        const overridden = scope
          .map((n) => resolve.source(referenceMonth, n, metric))
          .filter((source) => source.level !== row.level);
        if (overridden.length === 0) return [];
        const who = overridden[0]!;
        const where = overridden.length === scope.length ? '' : ` en ${overridden.length} de ${scope.length} nodos`;
        return [{
          metric,
          text: `${metric === 'growth' ? 'Crec.' : 'Churn'}${where}: manda ${TARGET_LEVEL_UI[who.level].label.toLowerCase()}${who.name ? ` ${who.name}` : ''} (${formatTarget(who.value)})`,
        }];
      });

    if (lines.length === 0) {
      return (
        <span className="font-bold text-emerald-400">
          Rige{scope.length > 1 ? ` en ${scope.length} nodos` : ''}
        </span>
      );
    }
    return (
      <span className="font-bold text-amber-400">
        {lines.map(({ metric, text }) => <span key={metric} className="block">{text}</span>)}
      </span>
    );
  };

  // El general es una sola fila: se enseña como métrica, no como tabla.
  const general = targets.find((other) => other.level === 'general');
  const byEntity = targets.filter((other) => other.level !== 'general');

  // Los meses calculados y, además, los que tengan excepción sin estar
  // calculados todavía (un mes futuro que ya se sabe que será distinto).
  const exceptions = new Map(monthTargets.map((row) => [row.period, row]));
  const monthRows: MonthRow[] = [...new Set([...periods.map(monthOf), ...exceptions.keys()])]
    .sort()
    .reverse()
    .map((period) => ({
      period,
      computed: periods.includes(period),
      exception: exceptions.get(period),
    }));

  const tierActions: Column<CatalogTarget> = {
    header: 'Acciones',
    align: 'right',
    accessor: (row) => (
      <div className="flex justify-end gap-2">
        <IconButton onClick={() => onEditTarget(row)} title="Editar" tone="sky">
          <Edit3 className="h-4 w-4" />
        </IconButton>
        <IconButton onClick={() => onDeleteTarget(row)} title="Eliminar" tone="rose">
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    ),
  };

  const entityColumns: Column<CatalogTarget>[] = [
    {
      header: 'Nivel',
      accessor: (row) => TARGET_LEVEL_UI[row.level].label,
      filterable: true,
      filterValue: (row) => TARGET_LEVEL_UI[row.level].label,
      sortKey: 'level',
    },
    { header: 'Entidad', accessor: (row) => <span className="font-bold text-white">{row.entity}</span>, sortKey: 'entity' },
    {
      header: 'Vigente desde',
      accessor: (row) => (row.since ? formatPeriodLabel(row.since) : 'Siempre'),
      sortKey: 'since',
    },
    { header: 'Crecimiento', accessor: (row) => value(row.growth_pct), align: 'right' },
    { header: 'Churn máx.', accessor: (row) => value(row.churn_pct), align: 'right' },
    { header: 'Rige hoy', accessor: effectiveToday },
    { header: 'Nota', accessor: (row) => row.note || '—' },
    tierActions,
  ];

  const monthColumns: Column<MonthRow>[] = [
    {
      header: 'Mes',
      accessor: (row) => (
        <span className="font-bold text-white">
          {formatPeriodLabel(row.period)}
          {!row.computed && <span className="ml-2 text-[10px] font-normal text-slate-500">sin calcular</span>}
        </span>
      ),
      sortKey: 'period',
    },
    {
      header: 'Crecimiento',
      accessor: (row) => formatTarget(overallTarget(cfg, row.period).growth),
      align: 'right',
    },
    {
      header: 'Churn máx.',
      accessor: (row) => formatTarget(overallTarget(cfg, row.period).churn),
      align: 'right',
    },
    {
      header: 'Origen',
      accessor: (row) => (row.exception
        ? <span className="font-bold text-amber-400">Excepción del mes</span>
        : <span className="text-slate-400">General</span>),
      filterable: true,
      filterValue: (row) => (row.exception ? 'Excepción del mes' : 'General'),
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          {row.exception ? (
            <>
              <IconButton onClick={() => onMonthException(row.period, row.exception)} title="Editar excepción" tone="sky">
                <Edit3 className="h-4 w-4" />
              </IconButton>
              <IconButton onClick={() => onDeleteMonth(row.exception!)} title="Quitar excepción" tone="rose">
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </>
          ) : (
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onMonthException(row.period)}>
              Excepción
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-5">
        <NeonContainer
          className="xl:col-span-2"
          title="Objetivo general"
          subtitle="Rige en todo lo que no tenga un objetivo propio ni una excepción de mes."
          icon={<Globe2 className="h-5 w-5" />}
          theme="slate"
          headerAction={
            <Button
              size="sm"
              icon={<Edit3 className="h-4 w-4" />}
              onClick={() => general && onEditGeneral(general)}
              disabled={!general}
            >
              Editar
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetricCard
              label="Crecimiento objetivo"
              value={formatTarget(cfg.general.growth)}
              subValue="Sobre la base inicial"
              color="green"
              icon={<Target className="h-4 w-4 text-emerald-400" />}
            />
            <MetricCard
              label="Churn máximo"
              value={formatTarget(cfg.general.churn)}
              subValue="Bajas / base inicial"
              color="red"
              icon={<TrendingDown className="h-4 w-4 text-rose-400" />}
            />
          </div>
          {general && (
            <p className="mt-4 text-[10px] text-slate-500">
              {general.note ? `${general.note} · ` : ''}
              Actualizado {general.updated_at}
              {general.updated_by ? ` por ${general.updated_by}` : ''}
            </p>
          )}
        </NeonContainer>

        <NeonContainer
          className="xl:col-span-3"
          title="Semáforo"
          subtitle="Umbrales fijos, iguales en todas las páginas del módulo."
          icon={<TrafficCone className="h-5 w-5" />}
          theme="yellow"
          headerAction={
            <Button
              size="sm"
              variant="outline"
              icon={<Edit3 className="h-4 w-4" />}
              onClick={onEditTrafficLight}
              disabled={!thresholds}
            >
              Editar semáforo
            </Button>
          }
        >
          <div className="space-y-5">
            {([
              ['Crecimiento', 'crecimiento', s.growth_green, s.growth_yellow],
              ['Churn', 'churn', s.churn_green, s.churn_yellow],
              ['Cumplimiento de la meta', 'cumplimiento', s.compliance_green, s.compliance_yellow],
            ] as const).map(([title, metric, green, yellow]) => (
              <div key={metric}>
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-300">{title}</p>
                <TrafficLightScale metric={metric} green={green} yellow={yellow} />
              </div>
            ))}
          </div>
        </NeonContainer>
      </div>

      <NeonContainer
        title="Objetivo de cada mes"
        subtitle="El que rige cada mes y de dónde sale. Una excepción corrige un mes ya calculado sin tocar el general."
        icon={<CalendarRange className="h-5 w-5" />}
        theme="blue"
        noPadding
        headerAction={
          <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onMonthException('')}>
            Excepción de otro mes
          </Button>
        }
      >
        {monthRows.length === 0 ? (
          <EmptyState title="Todavía no hay meses calculados" description="Cuando haya cierres aparecerán aquí con su objetivo." icon={<CalendarRange />} />
        ) : (
          <DataTable columns={monthColumns} data={monthRows} />
        )}
      </NeonContainer>

      <NeonContainer
        title="Por sucursal, estado, site, coordinador, zona y nodo"
        subtitle="Manda el nivel más alto que tenga objetivo: sucursal, estado, site, coordinador, zona y, por último, el nodo. «Rige hoy» avisa en qué nodos lo anula un nivel superior."
        icon={<Layers className="h-5 w-5" />}
        theme="purple"
        noPadding
        headerAction={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNewTarget}>
            Nuevo objetivo
          </Button>
        }
      >
        {byEntity.length === 0 ? (
          <EmptyState
            title="Nadie tiene objetivo propio"
            description="Todos los nodos se rigen por el objetivo de su mes. Desde aquí o desde la insignia de objetivo de los reportes se fija uno."
            icon={<Layers />}
          />
        ) : (
          <DataTable columns={entityColumns} data={byEntity} searchable searchPlaceholder="Buscar entidad..." />
        )}
      </NeonContainer>
    </div>
  );
}
