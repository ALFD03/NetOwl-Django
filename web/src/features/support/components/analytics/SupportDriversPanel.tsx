/**
 * Qué empuja el volumen del grupo: el tipo de ticket, la razón de la falla y la
 * solución aplicada, cada una en un anillo con sus valores más grandes.
 *
 * Debajo de cada anillo va su lista —nombre, tickets y parte—, que hace de
 * leyenda y deja leer la cifra sin pasar el ratón. Pasarlo por una franja pone
 * su nombre y su cifra en el centro.
 *
 * Para ATC «Escalado a Soporte» aparece como solución: es como terminó lo que
 * pasó a Soporte, y así se ve qué parte de su trabajo no resolvió él.
 */

import { Lightbulb } from 'lucide-react';

import { EmptyState, NeonContainer } from '@/shared/ui';
import { formatInteger } from '@/shared/utils';
import { desgloseDonut } from '../../lib/supportCharts';
import { SUPPORT_DESGLOSE_LABELS } from '../../lib/supportMetrics';
import { SUPPORT_DESGLOSES, type SupportDesglose, type SupportGroup } from '../../types';
import { AnilloConCentro } from './AnilloConCentro';

interface Props {
  group: SupportGroup | undefined;
}

function Desglose({ group, desglose }: { group: SupportGroup | undefined; desglose: SupportDesglose }) {
  const { data, total, partes, valores } = desgloseDonut(group?.[desglose]);

  return (
    <div className="flex min-w-0 flex-col">
      <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
        {SUPPORT_DESGLOSE_LABELS[desglose]}
      </h4>
      <p className="mb-3 text-[11px] text-slate-500">{formatInteger(valores)} valores distintos</p>

      {total === 0 ? (
        <EmptyState title="Sin tickets en el corte." icon={<Lightbulb />} size="sm" />
      ) : (
        <>
          <AnilloConCentro
            data={data}
            centro={{ title: 'Tickets', value: formatInteger(total) }}
            alPasar={(i) => ({
              title: partes[i]?.nombre ?? '',
              value: `${formatInteger(partes[i]?.tickets ?? 0)} · ${partes[i]?.pct ?? 0}%`,
            })}
            className="mx-auto aspect-square w-full max-w-[19rem]"
          />

          <ul className="mt-4 space-y-1.5">
            {partes.map((p) => (
              <li key={p.nombre} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="min-w-0 flex-1 truncate text-slate-300" title={p.nombre}>
                  {p.nombre}
                </span>
                <span className="font-mono text-slate-400">{formatInteger(p.tickets)}</span>
                <span className="w-12 text-right font-mono font-bold text-white">{p.pct}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function SupportDriversPanel({ group }: Props) {
  return (
    <NeonContainer
      theme="cyan"
      title="Qué empuja el volumen"
      subtitle="Reparto de los tickets del grupo · los seis valores más grandes y el resto en «Otros» · pasa el ratón por una franja para ver su cifra"
      icon={<Lightbulb className="h-5 w-5" />}
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {SUPPORT_DESGLOSES.map((desglose) => (
          <Desglose key={desglose} group={group} desglose={desglose} />
        ))}
      </div>
    </NeonContainer>
  );
}
