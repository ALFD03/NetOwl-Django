/**
 * Incidencia por zona en gráfico: las zonas con más tickets del grupo por cada
 * 100 clientes activos, coloreadas por tecnología.
 *
 * El numerador es del grupo y el denominador no —los clientes no se reparten
 * por grupo de soporte—, así que las tasas de los grupos suman la de la zona.
 * La tabla con todas las zonas está en Results.
 */

import { Link } from 'react-router-dom';
import { Radio, Table } from 'lucide-react';

import { BarChart } from '@/shared/charts';
import { EmptyState, NeonContainer } from '@/shared/ui';
import { formatInteger } from '@/shared/utils';
import {
  barsHeight,
  technologyColor,
  incidenceData,
  incidenceOptions,
  zonesWithRate,
} from '../../lib/supportCharts';
import type { SupportZoneRow } from '../../types';

interface Props {
  rows: SupportZoneRow[];
  groupName: string;
  resultsHref?: string;
}

export function SupportIncidenceChart({ rows, groupName, resultsHref }: Props) {
  const visible = zonesWithRate(rows);
  const withoutPopulation = rows.filter((r) => r.withoutPopulation).length;
  const technologies = [...new Set(visible.map((z) => z.technology))];
  const withRate = rows.length - withoutPopulation;

  return (
    <NeonContainer
      theme="yellow"
      title="Incidencia por zona"
      subtitle={`${groupName} · tickets por cada 100 clientes activos de la zona · ${formatInteger(withRate)} zonas con clientes${withoutPopulation ? `, ${formatInteger(withoutPopulation)} sin datos` : ''}`}
      icon={<Radio className="h-5 w-5" />}
    >
      {visible.length === 0 ? (
        <EmptyState
          title={`${groupName} no tiene tickets en zonas con clientes activos registrados.`}
          icon={<Radio />}
        />
      ) : (
        <>
          <div style={{ height: barsHeight(visible.length) }}>
            <BarChart data={incidenceData(rows)} options={incidenceOptions(rows)} className="h-full w-full" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="flex flex-wrap items-center gap-4">
              {technologies.map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: technologyColor(t) }} />
                  {t}
                </span>
              ))}
              {withRate > visible.length && (
                <span>Las {visible.length} de mayor incidencia de {formatInteger(withRate)}.</span>
              )}
            </span>
            {resultsHref && (
              <Link
                to={resultsHref}
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
