/** Envoltura con título y acento de una sección de gráficos. */

import type { ReactNode } from 'react';
import type { NeonTheme } from '@/shared/ui';

interface AnalyticsSectionProps {
  title: string;
  description?: string;
  theme: NeonTheme;
  children: ReactNode;
}

const SECTION_BORDER: Record<NeonTheme, string> = {
  slate: 'border-slate-500',
  green: 'border-emerald-500',
  red: 'border-rose-500',
  blue: 'border-sky-500',
  yellow: 'border-amber-500',
  purple: 'border-purple-500',
  cyan: 'border-cyan-500',
};

export function AnalyticsSection({
  title,
  description,
  theme,
  children,
}: AnalyticsSectionProps) {
  return (
    <section>
      <div
        className={[
          'border-l-4 pl-4 mb-6',
          SECTION_BORDER[theme],
        ].join(' ')}
      >
        <h2 className="text-lg font-bold text-white">
          {title}
        </h2>

        {description && (
          <p className="text-xs text-slate-500">
            {description}
          </p>
        )}
      </div>

      {children}
    </section>
  );
}