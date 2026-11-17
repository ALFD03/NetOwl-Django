/** Barra de progreso simple, con porcentaje opcional. */

import type { FC } from 'react';
import type { MetricColor } from '../theme/types';
import { METRIC_BAR, METRIC_TEXT } from '../theme/metricTheme';

interface ProgressBarProps {
  label: string;
  percent: number;
  valueLabel?: string;
  color?: MetricColor;
}

export const ProgressBar: FC<ProgressBarProps> = ({
  label,
  percent,
  valueLabel,
  color = 'blue',
}) => {
  const width = Math.min(100, Math.max(0, percent));

  return (
    <div>
      <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
        <span>{label}</span>
        {valueLabel != null && (
          <span className={METRIC_TEXT[color]}>{valueLabel}</span>
        )}
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${METRIC_BAR[color]}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
};
