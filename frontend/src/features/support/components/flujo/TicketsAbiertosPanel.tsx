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
import { antiguedadChartData, antiguedadChartOptions } from '../../lib/flujoCharts';
import {
  ETIQUETA_EQUIPO,
  ETIQUETA_TIPO,
  formatDuracion,
  formatHorasExactas,
} from '../../lib/flujoFormat';
import type { AbiertosGrupo, TicketAbierto, TicketsAbiertos } from '../../types';

type Agrupacion = 'por_etapa' | 'por_grupo' | 'por_asignado' | 'por_tipo_solicitud' | 'por_zona';

const AGRUPACIONES: { key: Agrupacion; label: string; campo: keyof AbiertosGrupo }[] = [
  { key: 'por_etapa', label: 'Etapa', campo: 'etapa_actual' },
  { key: 'por_grupo', label: 'Grupo de trabajo', campo: 'grupo_trabajo' },
  { key: 'por_asignado', label: 'Asignado a', campo: 'asignado_a' },
  { key: 'por_tipo_solicitud', label: 'Tipo', campo: 'tipo_solicitud' },
  { key: 'por_zona', label: 'Zona', campo: 'zona' },
];

const Duracion = ({
  horas,
  fuerte = false,
}: {
  horas: number | null | undefined;
  fuerte?: boolean;
}) => (
  <span
    title={formatHorasExactas(horas)}
    className={fuerte ? 'font-black text-amber-400' : undefined}
  >
    {formatDuracion(horas)}
  </span>
);

function columnasGrupo(campo: keyof AbiertosGrupo, etiqueta: string): Column<AbiertosGrupo>[] {
  const columnas: Column<AbiertosGrupo>[] = [
    {
      header: etiqueta,
      accessor: (r) => <StickyLabel minWidth="180px">{String(r[campo] ?? '—')}</StickyLabel>,
      sortKey: campo,
      sticky: true,
    },
  ];
  if (campo === 'etapa_actual') {
    columnas.push(
      {
        header: 'Equipo',
        accessor: (r) => (r.equipo_actual ? ETIQUETA_EQUIPO[r.equipo_actual] : '—'),
        sortKey: 'equipo_actual',
        filterable: true,
        filterValue: (r) => (r.equipo_actual ? ETIQUETA_EQUIPO[r.equipo_actual] : '—'),
      },
      {
        header: 'Tipo',
        accessor: (r) => (r.tipo_actual ? ETIQUETA_TIPO[r.tipo_actual] : '—'),
        sortKey: 'tipo_actual',
        filterable: true,
        filterValue: (r) => (r.tipo_actual ? ETIQUETA_TIPO[r.tipo_actual] : '—'),
      },
    );
  }
  columnas.push(
    {
      header: 'Abiertos',
      accessor: (r) => formatInteger(r.abiertos),
      align: 'right',
      sortKey: 'abiertos',
    },
    {
      header: 'Escalados',
      accessor: (r) => formatInteger(r.escalados),
      align: 'right',
      sortKey: 'escalados',
    },
    {
      header: 'Abierto hace (prom.)',
      accessor: (r) => <Duracion horas={r.edad_media} fuerte />,
      align: 'right',
      sortKey: 'edad_media',
    },
    {
      header: 'Abierto hace (mediana)',
      accessor: (r) => <Duracion horas={r.edad_mediana} />,
      align: 'right',
      sortKey: 'edad_mediana',
    },
    {
      header: 'El más viejo',
      accessor: (r) => <Duracion horas={r.edad_max} />,
      align: 'right',
      sortKey: 'edad_max',
    },
    {
      header: 'En su etapa (prom.)',
      accessor: (r) => <Duracion horas={r.en_etapa_media} />,
      align: 'right',
      sortKey: 'en_etapa_media',
    },
    {
      header: 'En su etapa (mediana)',
      accessor: (r) => <Duracion horas={r.en_etapa_mediana} />,
      align: 'right',
      sortKey: 'en_etapa_mediana',
    },
  );
  return columnas;
}

const COLUMNAS_LISTA: Column<TicketAbierto>[] = [
  {
    header: 'Ticket',
    accessor: (r) => <StickyLabel minWidth="110px">{r.ticket}</StickyLabel>,
    sortKey: 'ticket',
    sticky: true,
  },
  { header: 'Etapa', accessor: 'etapa', sortKey: 'etapa', filterable: true },
  {
    header: 'Equipo',
    accessor: (r) => ETIQUETA_EQUIPO[r.equipo],
    sortKey: 'equipo',
    filterable: true,
    filterValue: (r) => ETIQUETA_EQUIPO[r.equipo],
  },
  { header: 'Grupo', accessor: 'grupo_trabajo', sortKey: 'grupo_trabajo', filterable: true },
  { header: 'Asignado a', accessor: 'asignado_a', sortKey: 'asignado_a' },
  {
    header: 'Escalado',
    accessor: (r) => (r.escalado ? 'Sí' : '—'),
    sortKey: 'escalado',
    filterable: true,
    filterValue: (r) => (r.escalado ? 'Sí' : 'No'),
  },
  {
    header: 'Creado',
    accessor: (r) => (r.creado ? r.creado.replace('T', ' ').slice(0, 16) : '—'),
    sortKey: 'creado',
  },
  {
    header: 'Abierto hace',
    accessor: (r) => <Duracion horas={r.edad_h} fuerte />,
    align: 'right',
    sortKey: 'edad_h',
  },
  {
    header: 'En su etapa',
    accessor: (r) => <Duracion horas={r.en_etapa_h} />,
    align: 'right',
    sortKey: 'en_etapa_h',
  },
];

const EXCEL_LISTA = [
  { header: 'Ticket', value: (r: TicketAbierto) => r.ticket, width: 14 },
  { header: 'Etapa', value: (r: TicketAbierto) => r.etapa, width: 30 },
  { header: 'Equipo', value: (r: TicketAbierto) => ETIQUETA_EQUIPO[r.equipo], width: 10 },
  { header: 'Tipo de etapa', value: (r: TicketAbierto) => ETIQUETA_TIPO[r.tipo], width: 14 },
  { header: 'Grupo de trabajo', value: (r: TicketAbierto) => r.grupo_trabajo, width: 26 },
  { header: 'Asignado a', value: (r: TicketAbierto) => r.asignado_a, width: 26 },
  { header: 'Tipo', value: (r: TicketAbierto) => r.tipo_solicitud, width: 18 },
  { header: 'Zona', value: (r: TicketAbierto) => r.zona, width: 18 },
  { header: 'Escalado', value: (r: TicketAbierto) => (r.escalado ? 'Sí' : 'No'), width: 10 },
  {
    header: 'Creado',
    value: (r: TicketAbierto) => r.creado?.replace('T', ' ').slice(0, 16) ?? '',
    width: 18,
  },
  { header: 'Horas abierto', value: (r: TicketAbierto) => r.edad_h, format: '0.00', width: 14 },
  {
    header: 'Horas en su etapa',
    value: (r: TicketAbierto) => r.en_etapa_h,
    format: '0.00',
    width: 16,
  },
];

function Resumen({ datos }: { datos: TicketsAbiertos }) {
  const { resumen } = datos;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      <MetricCard
        label="Abiertos"
        value={formatInteger(resumen.abiertos)}
        color="slate"
        subValue={`ATC ${formatInteger(resumen.en_atc)} · Soporte ${formatInteger(resumen.en_soporte)}`}
      />
      <MetricCard
        label="Escalados abiertos"
        value={formatInteger(resumen.escalados)}
        color="purple"
        subValue={`En Soporte desde el escalamiento: ${formatDuracion(resumen.en_soporte_desde_escalamiento.muestra ? resumen.en_soporte_desde_escalamiento.medio : null)} (prom.)`}
      />
      <MetricCard
        label="Abierto hace (promedio)"
        value={formatDuracion(resumen.edad.muestra ? resumen.edad.medio : null)}
        color="yellow"
        subValue={`Mediana ${formatDuracion(resumen.edad.mediana)}`}
      />
      <MetricCard
        label="La cuarta parte más vieja"
        value={`> ${formatDuracion(resumen.edad.p75)}`}
        color="red"
        subValue={`El más viejo: ${formatDuracion(resumen.edad.max)}`}
      />
      <MetricCard
        label="En su etapa actual (prom.)"
        value={formatDuracion(resumen.en_etapa.muestra ? resumen.en_etapa.medio : null)}
        color="blue"
        subValue={`Mediana ${formatDuracion(resumen.en_etapa.mediana)}`}
      />
      <MetricCard
        label="Logs cargados hasta"
        value={datos.logs_hasta ? datos.logs_hasta.slice(0, 10) : '—'}
        color="slate"
        subValue={`Reloj: ${datos.ahora.replace('T', ' ').slice(0, 16)} (Caracas)`}
      />
    </div>
  );
}

/** Dónde están hoy: las etapas con más abiertos, con su parte del total. */
function DondeEstan({ datos }: { datos: TicketsAbiertos }) {
  const total = datos.resumen.abiertos;
  const etapas = [...datos.por_etapa].sort((a, b) => b.abiertos - a.abiertos).slice(0, 7);
  return (
    <div className="space-y-3">
      {etapas.map((e) => {
        const parte = total > 0 ? Math.round((e.abiertos / total) * 1000) / 10 : 0;
        return (
          <ProgressBar
            key={e.etapa_actual ?? '—'}
            label={`${e.etapa_actual ?? '—'} · ${formatInteger(e.abiertos)}${e.equipo_actual ? ` · ${ETIQUETA_EQUIPO[e.equipo_actual]}` : ''}`}
            percent={parte}
            valueLabel={`${parte}% · ${formatDuracion(e.edad_media)}`}
            color={e.equipo_actual === 'soporte' ? 'purple' : 'blue'}
          />
        );
      })}
      {datos.por_etapa.length > etapas.length && (
        <p className="text-[11px] text-slate-500">Las demás etapas, en la tabla de abajo.</p>
      )}
    </div>
  );
}

/**
 * Los tickets abiertos ahora (hora de Caracas), con los logs del último análisis.
 * Es la sección del Dashboard: no tiene mes.
 */
export function TicketsAbiertosPanel({ abiertos }: { abiertos: TicketsAbiertos | null }) {
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('por_etapa');
  const chart = useMemo(
    () => (abiertos ? antiguedadChartData(abiertos.antiguedad) : null),
    [abiertos],
  );

  if (!abiertos) {
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

  const activa = AGRUPACIONES.find((a) => a.key === agrupacion) ?? AGRUPACIONES[0];
  const vacio = abiertos.resumen.abiertos === 0;

  return (
    <div className="space-y-6">
      {abiertos.resumen.desfasados > 0 && (
        <StatusMessage
          icon={<AlertTriangle />}
          status={{
            type: 'warning',
            text: `${formatInteger(abiertos.resumen.desfasados)} tickets siguen abiertos según los logs pero el export de tickets ya los da por cerrados: no se cuentan. Carga el lote de logs más reciente y vuelve a ejecutar el análisis.`,
          }}
        />
      )}

      <Resumen datos={abiertos} />

      {vacio || !chart ? (
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
              <BarChart data={chart} options={antiguedadChartOptions} className="h-72 w-full" />
            </NeonContainer>
            <NeonContainer
              theme="yellow"
              title="Dónde están"
              subtitle="Las etapas con más abiertos y su antigüedad promedio"
              icon={<Hourglass className="h-5 w-5" />}
              className="xl:col-span-2"
            >
              <DondeEstan datos={abiertos} />
            </NeonContainer>
          </div>

          <NeonContainer
            theme="slate"
            title={`Abiertos por ${activa.label.toLowerCase()}`}
            subtitle="Dónde se acumulan y cuánto llevan"
            icon={<Layers className="h-5 w-5" />}
            headerAction={
              <div className="rounded-2xl border border-slate-800 bg-surface-primary p-1">
                <ToggleGroup
                  options={AGRUPACIONES.map((a) => ({ key: a.key, label: a.label }))}
                  activeKey={agrupacion}
                  onChange={(k) => setAgrupacion(k as Agrupacion)}
                />
              </div>
            }
            noPadding
          >
            <DataTable
              columns={columnasGrupo(activa.campo, activa.label)}
              data={abiertos[agrupacion]}
              searchable
              searchPlaceholder="Buscar..."
              emptyMessage="No hay tickets abiertos."
            />
          </NeonContainer>

          <NeonContainer
            theme="red"
            title="Los más antiguos"
            subtitle={`Los ${formatInteger(abiertos.lista.length)} abiertos hace más tiempo${abiertos.resumen.abiertos > abiertos.lista_limite ? ` (de ${formatInteger(abiertos.resumen.abiertos)})` : ''}`}
            icon={<ListOrdered className="h-5 w-5" />}
            headerAction={
              <ExcelExportButton
                rows={abiertos.lista}
                columns={EXCEL_LISTA}
                fileName="tickets-abiertos"
                sheetName="Abiertos"
              />
            }
            noPadding
          >
            <DataTable
              columns={COLUMNAS_LISTA}
              data={abiertos.lista}
              searchable
              searchPlaceholder="Buscar ticket, asignado..."
            />
          </NeonContainer>
        </>
      )}
    </div>
  );
}
