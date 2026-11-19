/** Cómo contestaron los clientes del mes, pregunta por pregunta. */

import { EmptyState, Panel, ProgressBar, SummaryStrip } from '@/shared/ui';

import { pct } from '../lib/format';
import type { SurveyResults } from '../types';

export function ResultsPanel({ results: r }: { results: SurveyResults }) {
  return (
    <div className="space-y-4">
      <SummaryStrip
        columns={5}
        mono
        items={[
          { id: 'total', label: 'En la lista', value: r.total },
          { id: 'completed', label: 'Completadas', value: r.completed, caption: pct(r.completed, r.total), tone: 'green' },
          { id: 'pending', label: 'Pendientes', value: r.pending },
          { id: 'no_answer', label: 'No contesta', value: r.no_answer, tone: 'yellow' },
          { id: 'refused', label: 'Rechazó', value: r.refused, tone: 'red' },
        ]}
      />

      {r.completed === 0 ? (
        <EmptyState
          title="Todavía no hay encuestas completadas"
          description="Los resultados aparecen cuando se registran respuestas."
          size="md"
          bordered
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {r.questions.map((q) => (
            <Panel
              key={q.id}
              title={q.text}
              description={`${q.answered} respuestas${q.active ? '' : ' · pregunta desactivada'}`}
            >
              <ul className="space-y-2.5">
                {q.options.map((o) => (
                  <li key={o.id}>
                    <ProgressBar
                      label={o.text}
                      percent={o.pct ?? 0}
                      valueLabel={o.pct !== null ? `${o.n} · ${o.pct}%` : String(o.n)}
                    />
                  </li>
                ))}
              </ul>
              {q.texts.length > 0 && (
                <div className={q.options.length > 0 ? 'mt-4 border-t border-slate-800 pt-3' : ''}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Respuestas escritas ({q.texts_total})
                  </p>
                  <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {q.texts.map((t, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-200"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                  {q.texts_total > q.texts.length && (
                    <p className="mt-2 text-[10px] text-slate-500">Se muestran las primeras {q.texts.length}.</p>
                  )}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
