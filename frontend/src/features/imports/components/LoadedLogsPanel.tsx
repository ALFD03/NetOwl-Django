/** Los meses de logs de soporte que ya hay: la carga es por lotes y lo que falta no avisa solo. */

import { Panel } from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';

import type { LoadedLogs } from '../types';

export function LoadedLogsPanel({ loaded }: { loaded: LoadedLogs }) {
  const maxLogs = Math.max(1, ...loaded.by_month.map((m) => m.logs));
  return (
    <Panel title="Logs de etapa cargados">
      {loaded.logs === 0 ? (
        <p className="text-xs text-slate-400">Todavía no se ha cargado ningún lote.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-300">
            <strong className="text-white">{formatInteger(loaded.logs)}</strong> logs de{' '}
            <strong className="text-white">{formatInteger(loaded.tickets)}</strong> tickets, del{' '}
            {loaded.since} al {loaded.until}. Un mes con muchos menos logs que sus vecinos suele ser
            un lote que falta.
          </p>
          <div className="space-y-1.5">
            {loaded.by_month.map((m) => (
              <div
                key={m.month}
                className="grid grid-cols-[64px_1fr_72px] items-center gap-3 text-xs"
              >
                <span className="font-bold text-slate-300">{m.month}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${(m.logs / maxLogs) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums text-slate-400">
                  {formatInteger(m.logs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
