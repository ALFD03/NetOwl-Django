/**
 * La pestaña de objetivos del catálogo: el general con su semáforo, las
 * excepciones por mes y los objetivos propios de zonas, sites, estados y
 * coordinadores.
 *
 * Solo edita. Quien aplica los objetivos es el cliente de cada reporte
 * (`lib/objetivos.ts`); aquí se usa esa misma función para enseñar el objetivo
 * efectivo de cada mes, así que lo que dice esta tabla es lo que verá el reporte.
 */

import type { ReactNode } from 'react';
import { CalendarRange, Edit3, Globe2, Layers, Plus, Trash2, TrafficCone } from 'lucide-react';

import { Button, DataTable, EmptyState, NeonContainer, type Column } from '@/shared/ui';
import { formatPeriodoLabel } from '@/shared/utils/formatters';
import {
  OBJETIVOS_POR_DEFECTO,
  formatObjetivo,
  mesDe,
  objetivoGeneral,
} from '../../lib/objetivos';
import type {
  CatalogoObjetivo,
  CatalogoObjetivoMes,
  CatalogoSemaforo,
  ObjetivosConfig,
} from '../../types';
import { NIVEL_OBJETIVO_UI } from './ObjetivoForms';

export interface ObjetivosPanelProps {
  objetivos: CatalogoObjetivo[];
  objetivosMes: CatalogoObjetivoMes[];
  semaforo: CatalogoSemaforo | null;
  config: ObjetivosConfig | null;
  /** Meses con cierre calculado, `YYYY-MM`. */
  periodos: string[];
  onNuevoGeneral: () => void;
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

/** El mes de hoy, `YYYY-MM`: el que se usa para la vista previa del semáforo. */
const mesActual = (): string => new Date().toISOString().slice(0, 7);

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
  onNuevoGeneral,
  onNuevoObjetivo,
  onEditarObjetivo,
  onBorrarObjetivo,
  onExcepcionMes,
  onBorrarMes,
  onEditarSemaforo,
}: ObjetivosPanelProps) {
  const cfg = config ?? OBJETIVOS_POR_DEFECTO;
  const hoy = objetivoGeneral(cfg, periodos[0] ?? mesActual());
  const s = semaforo ?? OBJETIVOS_POR_DEFECTO.semaforo;

  const generales = objetivos.filter((o) => o.nivel === 'general');
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
    accessor: (row) => {
      const esBase = row.nivel === 'general' && !row.desde;
      return (
        <div className="flex justify-end gap-2">
          <BotonIcono onClick={() => onEditarObjetivo(row)} title="Editar" tone="sky">
            <Edit3 className="h-4 w-4" />
          </BotonIcono>
          {!esBase && (
            <BotonIcono onClick={() => onBorrarObjetivo(row)} title="Eliminar" tone="rose">
              <Trash2 className="h-4 w-4" />
            </BotonIcono>
          )}
        </div>
      );
    },
  };

  const columnasGeneral: Column<CatalogoObjetivo>[] = [
    {
      header: 'Vigente desde',
      accessor: (row) => (row.desde ? formatPeriodoLabel(row.desde) : <span className="font-bold text-white">Siempre</span>),
      sortKey: 'desde',
    },
    { header: 'Crecimiento', accessor: (row) => valor(row.crecimiento_pct), align: 'right' },
    { header: 'Churn máx.', accessor: (row) => valor(row.churn_pct), align: 'right' },
    { header: 'Nota', accessor: (row) => row.nota || '—' },
    { header: 'Actualizado', accessor: (row) => `${row.actualizado_en}${row.actualizado_por ? ` · ${row.actualizado_por}` : ''}` },
    accionesTramo,
  ];

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
      <NeonContainer
        title="Objetivo general"
        subtitle="Rige en todo lo que no tenga un objetivo propio. Cada tramo vale desde su mes hasta el siguiente."
        icon={<Globe2 className="h-5 w-5" />}
        theme="slate"
        noPadding
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<TrafficCone className="h-4 w-4" />} onClick={onEditarSemaforo} disabled={!semaforo}>
              Semáforo
            </Button>
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNuevoGeneral}>
              Nuevo tramo
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 border-b border-slate-800 p-4 text-[11px] text-slate-400 md:grid-cols-3">
          <p>
            <span className="font-black uppercase tracking-wider text-slate-300">Cumplimiento</span>
            {' '}verde ≥ {formatObjetivo(s.cumpl_verde)} · amarillo ≥ {formatObjetivo(s.cumpl_amarillo)}
          </p>
          <p>
            <span className="font-black uppercase tracking-wider text-slate-300">Crecimiento</span>
            {' '}con {formatObjetivo(hoy.crecimiento)}: verde ≥ {formatObjetivo(hoy.crecimiento - s.crec_verde_margen)}
            {' '}· amarillo ≥ {formatObjetivo(hoy.crecimiento - s.crec_amarillo_margen)}
          </p>
          <p>
            <span className="font-black uppercase tracking-wider text-slate-300">Churn</span>
            {' '}con {formatObjetivo(hoy.churn)}: verde ≤ {formatObjetivo(hoy.churn + s.churn_verde_margen)}
            {' '}· amarillo ≤ {formatObjetivo(hoy.churn + s.churn_amarillo_margen)}
          </p>
        </div>
        <DataTable columns={columnasGeneral} data={generales} />
      </NeonContainer>

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
        subtitle="Cada nivel hereda del de arriba y nunca del de abajo: el objetivo de una zona no mueve el total de su site ni el de su coordinador."
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
