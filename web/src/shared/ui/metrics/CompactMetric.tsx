import type { FC, ReactNode } from 'react';
import type { MetricColor } from '../theme/types';
import { METRIC_COMPACT } from '../theme/metricTheme';

interface CompactMetricProps {
  label: string;
  value: ReactNode;
  color?: MetricColor;
}

export const CompactMetric: FC<CompactMetricProps> = ({ label, value, color = 'blue' }) => (
  <div className={`p-2.5 rounded-2xl border ${METRIC_COMPACT[color]} flex flex-col justify-between`}>
    <p className="text-[9px] uppercase font-black opacity-80 mb-1 leading-none">{label}</p>
    <p className="text-sm font-black tracking-tight leading-none font-mono">{value}</p>
  </div>
);
