import { Activity } from 'lucide-react';
import type { ReactNode } from 'react';

import { Panel } from '@/shared/ui';

export interface RequirementsCardProps {
  title: string;
  /** One bullet per requirement; may contain `<strong>` emphasis. */
  requirements: ReactNode[];
  /** Optional highlighted note pinned to the bottom of the card. */
  note?: ReactNode;
  className?: string;
}

/** The "what this file must contain" panel beside each upload form. */
export function RequirementsCard({ title, requirements, note, className }: RequirementsCardProps) {
  return (
    <Panel title={title} stretch className={className}>
      <ul className="list-inside list-disc space-y-2.5 text-xs leading-relaxed text-slate-400">
        {requirements.map((requirement, idx) => (
          <li key={idx}>{requirement}</li>
        ))}
      </ul>

      {note && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 p-4">
          <Activity className="h-5 w-5 flex-shrink-0 text-brand" />
          <p className="text-[11px] text-slate-400">{note}</p>
        </div>
      )}
    </Panel>
  );
}
