/**
 * La pestaña de objetivos del catálogo: el general y el semáforo como
 * métricas, las excepciones por mes y los objetivos propios de zonas, sites,
 * estados y coordinadores.
 *
 * Solo edita. Quien aplica los objetivos es el cliente de cada reporte
 * (`lib/objetivos.ts`); aquí se usa esa misma función para enseñar el objetivo
 * efectivo de cada mes, así que lo que dice esta tabla es lo que verá el reporte.
 */

import type { ReactNode } from 'react';
import { CalendarRange, Edit3, Globe2, Layers, Plus, Target, Trash2, TrafficCone, TrendingDown } from 'lucide-react';

import { Button, DataTable, EmptyState, MetricCard, NeonContainer, type Column } from '@/shared/ui';
import { formatPeriodoLabel } from '@/shared/utils/formatters';
import {
  OBJETIVOS_POR_DEFECTO,
  crearResolver,
  formatObjetivo,
  mesDe,
  objetivoGeneral,
} from '../../lib/objetivos';
import type {
  CatalogoObjetivo,
  CatalogoObjetivoMes,
  CatalogoSemaforo,
  CatalogoZona,
  ObjetivosConfig,
} from '../../types';
import { EscalaSemaforo } from './EscalaSemaforo';
import { NIVEL_OBJETIVO_UI } from './ObjetivoForms';

export interface ObjetivosPanelProps {
  objetivos: CatalogoObjetivo[];
  objetivosMes: CatalogoObjetivoMes[];
  semaforo: CatalogoSemaforo | null;
  config: ObjetivosConfig | null;
  /** Meses con cierre calculado, `YYYY-MM`. */
  periodos: string[];
  /** El catálogo de zonas: dice a qué coordinador, site y estado pertenece cada una. */
  zonas: CatalogoZona[];
  onEditarGeneral: (fila: CatalogoObjetivo) => void;
  onNuevoObjetivo: () => void;
  onEditarObjetivo: (fila: CatalogoObjetivo) => void;
  onBorrarObjetivo: (fila: CatalogoObjetivo) => void;
  onExcepcionMes: (periodo: string, existente?: CatalogoObjetivoMes) => void;
  onBorrarMes: (fila: CatalogoObjetivoMes) => void;
  onEditarSemaforo: () => void;
}

/** Un porcentaje de objetivo, o "hereda" si el tramo no lo fija. */
const valor = (pct: number | null): ReactNode =>
  pct === null ? <span className="text-slate-500">hereda</span> : formatObjetivo(pct);

interface FilaMes {
  periodo: string;
  calculado: boolean;
  excepcion?: CatalogoObjetivoMes;
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

export function ObjetivosPanel({
  objetivos,
  objetivosMes,
  semaforo,
  config,
  periodos,
  zonas,
  onEditarGeneral,
  onNuevoObjetivo,
  onEditarObjetivo,
  onBorrarObjetivo,
  onExcepcionMes,
  onBorrarMes,
  onEditarSemaforo,
}: ObjetivosPanelProps) {
  const cfg = config ?? OBJETIVOS_POR_DEFECTO;
  const s = semaforo ?? OBJETIVOS_POR_DEFECTO.semaforo;

  // Con la misma resolución que los reportes, para decir de cada zona con
  // objetivo propio si rige o si un nivel superior lo anula. Se mide en el mes
  // más reciente calculado.
  const mesReferencia = periodos[0] ?? new Date().toISOString().slice(0, 7);
  const resolver = crearResolver(
    cfg,
    zonas.map((z) => ({ name: z.nombre, site: z.site, type: z.tecnologia, coordinador: z.coordinador, estado: z.estado })),
  );

  /** En una fila de zona: qué rige hoy en cada métrica que fija, y por qué. */
  const rigeHoy = (row: CatalogoObjetivo): ReactNode => {
    if (row.nivel !== 'zona') return <span className="text-slate-600">—</span>;
    const anuladas = (['crecimiento', 'churn'] as const)
      .filter((metrica) => row[`${metrica}_pct`] !== null)
      .map((metrica) => ({ metrica, origen: resolver.origen(mesReferencia, row.entidad, metrica) }))
      .filter(({ origen }) => origen.nivel !== 'zona');
    if (anuladas.length === 0) {
      return <span className="font-bold text-emerald-400">Su objetivo</span>;
    }
    return (
      <span className="font-bold text-amber-400">
        {anuladas.map(({ metrica, origen }) => (
          <span key={metrica} className="block">
            {metrica === 'crecimiento' ? 'Crec.' : 'Churn'}: manda {NIVEL_OBJETIVO_UI[origen.nivel].label.toLowerCase()}
            {' '}{origen.nombre} ({formatObjetivo(origen.valor)})
          </span>
        ))}
      </span>
    );
  };

  // El general es una sola fila: se enseña como métrica, no como tabla.
  const general = objetivos.find((o) => o.nivel === 'general');
  const porEntidad = objetivos.filter((o) => o.nivel !== 'general');

  // Los meses calculados y, además, los que tengan excepción sin estar
  // calculados todavía (un mes futuro que ya se sabe que será distinto).
  const excepciones = new Map(objetivosMes.map((fila) => [fila.periodo, fila]));
  const filasMes: FilaMes[] = [...new Set([...periodos.map(mesDe), ...excepciones.keys()])]
    .sort()
    .reverse()
    .map((periodo) => ({
      periodo,
      calculado: periodos.includes(periodo),
      excepcion: excepciones.get(periodo),
    }));

  const accionesTramo: Column<CatalogoObjetivo> = {
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

  const columnasEntidad: Column<CatalogoObjetivo>[] = [
    {
      header: 'Nivel',
      accessor: (row) => NIVEL_OBJETIVO_UI[row.nivel].label,
      filterable: true,
      filterValue: (row) => NIVEL_OBJETIVO_UI[row.nivel].label,
      sortKey: 'nivel',
    },
    { header: 'Entidad', accessor: (row) => <span className="font-bold text-white">{row.entidad}</span>, sortKey: 'entidad' },
    {
      header: 'Vigente desde',
      accessor: (row) => (row.desde ? formatPeriodoLabel(row.desde) : 'Siempre'),
      sortKey: 'desde',
    },
    { header: 'Crecimiento', accessor: (row) => valor(row.crecimiento_pct), align: 'right' },
    { header: 'Churn máx.', accessor: (row) => valor(row.churn_pct), align: 'right' },
    { header: 'Rige hoy', accessor: rigeHoy },
    { header: 'Nota', accessor: (row) => row.nota || '—' },
    accionesTramo,
  ];

  const columnasMes: Column<FilaMes>[] = [
    {
      header: 'Mes',
      accessor: (row) => (
        <span className="font-bold text-white">
          {formatPeriodoLabel(row.periodo)}
          {!row.calculado && <span className="ml-2 text-[10px] font-normal text-slate-500">sin calcular</span>}
        </span>
      ),
      sortKey: 'periodo',
    },
    {
      header: 'Crecimiento',
      accessor: (row) => formatObjetivo(objetivoGeneral(cfg, row.periodo).crecimiento),
      align: 'right',
    },
    {
      header: 'Churn máx.',
      accessor: (row) => formatObjetivo(objetivoGeneral(cfg, row.periodo).churn),
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
              value={formatObjetivo(cfg.general.crecimiento)}
              subValue="Sobre la base inicial"
              color="green"
              icon={<Target className="h-4 w-4 text-emerald-400" />}
            />
            <MetricCard
              label="Churn máximo"
              value={formatObjetivo(cfg.general.churn)}
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
                <EscalaSemaforo metrica={metrica} verde={verde} amarillo={amarillo} />
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
        {filasMes.length === 0 ? (
          <EmptyState title="Todavía no hay meses calculados" description="Cuando haya cierres aparecerán aquí con su objetivo." icon={<CalendarRange />} />
        ) : (
          <DataTable columns={columnasMes} data={filasMes} />
        )}
      </NeonContainer>

      <NeonContainer
        title="Por zona, site, estado y coordinador"
        subtitle="Manda el nivel más alto que tenga objetivo: estado, site, coordinador y, por último, la zona. «Rige hoy» avisa cuando el de una zona queda anulado."
        icon={<Layers className="h-5 w-5" />}
        theme="purple"
        noPadding
        headerAction={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNuevoObjetivo}>
            Nuevo objetivo
          </Button>
        }
      >
        {porEntidad.length === 0 ? (
          <EmptyState
            title="Nadie tiene objetivo propio"
            description="Todas las zonas, sites, estados y coordinadores se rigen por el objetivo de su mes."
            icon={<Layers />}
          />
        ) : (
          <DataTable columns={columnasEntidad} data={porEntidad} searchable searchPlaceholder="Buscar entidad..." />
        )}
      </NeonContainer>
    </div>
  );
}
