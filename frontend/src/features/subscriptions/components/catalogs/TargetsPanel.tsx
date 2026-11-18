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
  objetivos: CatalogTarget[];
  monthTargets: CatalogMonthTarget[];
  semaforo: CatalogTrafficLight | null;
  config: TargetsConfig | null;
  /** Meses con cierre calculado, `YYYY-MM`. */
  periodos: string[];
  /** El catálogo de zonas: dice a qué coordinador, site y estado pertenece cada una. */
  zonas: CatalogZone[];
  /** Los nodos de los datos: a cuáles alcanza cada objetivo. */
  nodos: KnownNode[];
  onEditarGeneral: (row: CatalogTarget) => void;
  onNewTarget: () => void;
  onEditTarget: (row: CatalogTarget) => void;
  onDeleteTarget: (row: CatalogTarget) => void;
  onMonthException: (periodo: string, existente?: CatalogMonthTarget) => void;
  onDeleteMonth: (row: CatalogMonthTarget) => void;
  onEditTrafficLight: () => void;
}

/** Un porcentaje de objetivo, o "hereda" si el tramo no lo fija. */
const valor = (pct: number | null): ReactNode =>
  pct === null ? <span className="text-slate-500">hereda</span> : formatTarget(pct);

interface MonthRow {
  periodo: string;
  calculado: boolean;
  excepcion?: CatalogMonthTarget;
}

function BotonIcono({
  onClick, title, tone, children,
}: { onClick: () => void; title: string; tone: 'sky' | 'rose'; children: ReactNode }) {
  const clases = tone === 'sky'
    ? 'border-sky-500/30 text-sky-400 hover:bg-sky-500/10'
    : 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10';
  return (
    <button type="button" onClick={onClick} title={title} className={`rounded-lg border p-2 ${clases}`}>
      {children}
    </button>
  );
}

export function TargetsPanel({
  objetivos,
  monthTargets: objetivosMes,
  semaforo,
  config,
  periodos,
  zonas,
  nodos,
  onEditarGeneral,
  onNewTarget: onNuevoObjetivo,
  onEditTarget: onEditarObjetivo,
  onDeleteTarget: onBorrarObjetivo,
  onMonthException: onExcepcionMes,
  onDeleteMonth: onBorrarMes,
  onEditTrafficLight: onEditarSemaforo,
}: TargetsPanelProps) {
  const cfg = config ?? DEFAULT_TARGETS;
  const s = semaforo ?? DEFAULT_TARGETS.semaforo;

  // Con la misma resolución que los reportes, para decir de cada objetivo en
  // qué nodos rige y en cuáles lo anula un nivel superior. Se mide en el mes
  // más reciente calculado.
  const referenceMonth = periodos[0] ?? new Date().toISOString().slice(0, 7);
  const zoneOf = new Map(zonas.map((z) => [z.nombre.toLowerCase(), z]));
  const resolve = createResolver(
    cfg,
    zonas.map((z) => ({ name: z.nombre, site: z.site, type: z.tecnologia, coordinador: z.coordinador, estado: z.estado })),
  );

  /** Los nodos de los datos a los que alcanza un objetivo. */
  const nodesOf = (row: CatalogTarget): KnownNode[] => {
    const igual = (a: string | undefined, b: string) => (a ?? '').toLowerCase() === b.toLowerCase();
    return nodos.filter((n) => {
      const zona = zoneOf.get(n.zona.toLowerCase());
      switch (row.nivel) {
        case 'zona_sucursal': return igual(n.nodo, row.entidad);
        case 'zona': return igual(n.zona, row.entidad);
        case 'sucursal': return igual(n.sucursal, row.entidad);
        case 'coordinador': return igual(zona?.coordinador, row.entidad);
        case 'site': return igual(zona?.site, row.entidad);
        case 'estado': return igual(zona?.estado, row.entidad);
        default: return false;
      }
    });
  };

  /** Qué rige hoy en los nodos que alcanza el objetivo, por cada métrica que fija. */
  const effectiveToday = (row: CatalogTarget): ReactNode => {
    const alcance = nodesOf(row);
    if (alcance.length === 0) return <span className="text-slate-600">Sin nodos en los datos</span>;

    const lineas = (['crecimiento', 'churn'] as const)
      .filter((metrica) => row[`${metrica}_pct`] !== null)
      .flatMap((metrica) => {
        const anulados = alcance
          .map((n) => resolve.origen(referenceMonth, n, metrica))
          .filter((origen) => origen.nivel !== row.nivel);
        if (anulados.length === 0) return [];
        const quien = anulados[0]!;
        const donde = anulados.length === alcance.length ? '' : ` en ${anulados.length} de ${alcance.length} nodos`;
        return [{
          metrica,
          texto: `${metrica === 'crecimiento' ? 'Crec.' : 'Churn'}${donde}: manda ${TARGET_LEVEL_UI[quien.nivel].label.toLowerCase()}${quien.nombre ? ` ${quien.nombre}` : ''} (${formatTarget(quien.valor)})`,
        }];
      });

    if (lineas.length === 0) {
      return (
        <span className="font-bold text-emerald-400">
          Rige{alcance.length > 1 ? ` en ${alcance.length} nodos` : ''}
        </span>
      );
    }
    return (
      <span className="font-bold text-amber-400">
        {lineas.map(({ metrica, texto }) => <span key={metrica} className="block">{texto}</span>)}
      </span>
    );
  };

  // El general es una sola fila: se enseña como métrica, no como tabla.
  const general = objetivos.find((other) => other.nivel === 'general');
  const byEntity = objetivos.filter((other) => other.nivel !== 'general');

  // Los meses calculados y, además, los que tengan excepción sin estar
  // calculados todavía (un mes futuro que ya se sabe que será distinto).
  const excepciones = new Map(objetivosMes.map((row) => [row.periodo, row]));
  const monthRows: MonthRow[] = [...new Set([...periodos.map(monthOf), ...excepciones.keys()])]
    .sort()
    .reverse()
    .map((periodo) => ({
      periodo,
      calculado: periodos.includes(periodo),
      excepcion: excepciones.get(periodo),
    }));

  const tierActions: Column<CatalogTarget> = {
    header: 'Acciones',
    align: 'right',
    accessor: (row) => (
      <div className="flex justify-end gap-2">
        <BotonIcono onClick={() => onEditarObjetivo(row)} title="Editar" tone="sky">
          <Edit3 className="h-4 w-4" />
        </BotonIcono>
        <BotonIcono onClick={() => onBorrarObjetivo(row)} title="Eliminar" tone="rose">
          <Trash2 className="h-4 w-4" />
        </BotonIcono>
      </div>
    ),
  };

  const entityColumns: Column<CatalogTarget>[] = [
    {
      header: 'Nivel',
      accessor: (row) => TARGET_LEVEL_UI[row.nivel].label,
      filterable: true,
      filterValue: (row) => TARGET_LEVEL_UI[row.nivel].label,
      sortKey: 'nivel',
    },
    { header: 'Entidad', accessor: (row) => <span className="font-bold text-white">{row.entidad}</span>, sortKey: 'entidad' },
    {
      header: 'Vigente desde',
      accessor: (row) => (row.desde ? formatPeriodLabel(row.desde) : 'Siempre'),
      sortKey: 'desde',
    },
    { header: 'Crecimiento', accessor: (row) => valor(row.crecimiento_pct), align: 'right' },
    { header: 'Churn máx.', accessor: (row) => valor(row.churn_pct), align: 'right' },
    { header: 'Rige hoy', accessor: effectiveToday },
    { header: 'Nota', accessor: (row) => row.nota || '—' },
    tierActions,
  ];

  const monthColumns: Column<MonthRow>[] = [
    {
      header: 'Mes',
      accessor: (row) => (
        <span className="font-bold text-white">
          {formatPeriodLabel(row.periodo)}
          {!row.calculado && <span className="ml-2 text-[10px] font-normal text-slate-500">sin calcular</span>}
        </span>
      ),
      sortKey: 'periodo',
    },
    {
      header: 'Crecimiento',
      accessor: (row) => formatTarget(overallTarget(cfg, row.periodo).crecimiento),
      align: 'right',
    },
    {
      header: 'Churn máx.',
      accessor: (row) => formatTarget(overallTarget(cfg, row.periodo).churn),
      align: 'right',
    },
    {
      header: 'Origen',
      accessor: (row) => (row.excepcion
        ? <span className="font-bold text-amber-400">Excepción del mes</span>
        : <span className="text-slate-400">General</span>),
      filterable: true,
      filterValue: (row) => (row.excepcion ? 'Excepción del mes' : 'General'),
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          {row.excepcion ? (
            <>
              <BotonIcono onClick={() => onExcepcionMes(row.periodo, row.excepcion)} title="Editar excepción" tone="sky">
                <Edit3 className="h-4 w-4" />
              </BotonIcono>
              <BotonIcono onClick={() => onBorrarMes(row.excepcion!)} title="Quitar excepción" tone="rose">
                <Trash2 className="h-4 w-4" />
              </BotonIcono>
            </>
          ) : (
            <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onExcepcionMes(row.periodo)}>
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
              onClick={() => general && onEditarGeneral(general)}
              disabled={!general}
            >
              Editar
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetricCard
              label="Crecimiento objetivo"
              value={formatTarget(cfg.general.crecimiento)}
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
              {general.nota ? `${general.nota} · ` : ''}
              Actualizado {general.actualizado_en}
              {general.actualizado_por ? ` por ${general.actualizado_por}` : ''}
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
              onClick={onEditarSemaforo}
              disabled={!semaforo}
            >
              Editar semáforo
            </Button>
          }
        >
          <div className="space-y-5">
            {([
              ['Crecimiento', 'crecimiento', s.crec_verde, s.crec_amarillo],
              ['Churn', 'churn', s.churn_verde, s.churn_amarillo],
              ['Cumplimiento de la meta', 'cumplimiento', s.cumpl_verde, s.cumpl_amarillo],
            ] as const).map(([titulo, metrica, verde, amarillo]) => (
              <div key={metrica}>
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-300">{titulo}</p>
                <TrafficLightScale metrica={metrica} verde={verde} amarillo={amarillo} />
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
          <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onExcepcionMes('')}>
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
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNuevoObjetivo}>
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
