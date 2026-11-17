/**
 * Incidencia por zona en gráfico: las zonas con más tickets del grupo por cada
 * 100 clientes activos, coloreadas por tecnología.
 *
 * El numerador es del grupo y el denominador no —los clientes no se reparten
 * por grupo de soporte—, así que las tasas de los grupos suman la de la zona.
 * La tabla con todas las zonas está en Results.
 */

import { Link } from '@inertiajs/react';
import { Radio, Table } from 'lucide-react';

import { BarChart } from '@/shared/charts';
import { EmptyState, NeonContainer } from '@/shared/ui';
import { formatInteger } from '@/shared/utils';
import {
  altoBarras,
  colorTecnologia,
  incidenciaData,
  incidenciaOptions,
  zonasConTasa,
} from '../../lib/supportCharts';
import type { SupportZoneRow } from '../../types';

interface Props {
  rows: SupportZoneRow[];
  groupName: string;
  resultsHref?: string;
}

export function SupportIncidenceChart({ rows, groupName, resultsHref }: Props) {
  const visibles = zonasConTasa(rows);
  const sinPoblacion = rows.filter((r) => r.sinPoblacion).length;
  const tecnologias = [...new Set(visibles.map((z) => z.tecnologia))];
  const conTasa = rows.length - sinPoblacion;

  return (
    <NeonContainer
      theme="yellow"
      title="Incidencia por zona"
      subtitle={`${groupName} · tickets por cada 100 clientes activos de la zona · ${formatInteger(conTasa)} zonas con clientes${sinPoblacion ? `, ${formatInteger(sinPoblacion)} sin datos` : ''}`}
      icon={<Radio className="h-5 w-5" />}
    >
      {visibles.length === 0 ? (
        <EmptyState
          title={`${groupName} no tiene tickets en zonas con clientes activos registrados.`}
          icon={<Radio />}
        />
      ) : (
        <>
          <div style={{ height: altoBarras(visibles.length) }}>
            <BarChart data={incidenciaData(rows)} options={incidenciaOptions(rows)} className="h-full w-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="flex flex-wrap items-center gap-4">
              {tecnologias.map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorTecnologia(t) }} />
                  {t}
                </span>
              ))}
              {conTasa > visibles.length && (
                <span>Las {visibles.length} de mayor incidencia de {formatInteger(conTasa)}.</span>
              )}
            </span>
            {resultsHref && (
              <Link
                href={resultsHref}
                className="flex items-center gap-1.5 rounded-full border border-brand/40 px-3 py-1 font-semibold text-brand hover:bg-brand/10"
              >
                <Table className="h-3.5 w-3.5" /> Todas las zonas en Results
              </Link>
            )}
          </div>
        </>
      )}
    </NeonContainer>
  );
}
