/** Punto que late: marca que algo está en curso. */

import type { FC } from 'react';
import type { MetricColor } from '../theme/types';
import { METRIC_PULSE } from '../theme/metricTheme';

interface PulseDotProps {
  color?: MetricColor;
}

export const PulseDot: FC<PulseDotProps> = ({ color = 'green' }) => (
  <span className="relative flex h-2.5 w-2.5">
    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${METRIC_PULSE[color]}`} />
    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${METRIC_PULSE[color]}`} />
  </span>
);
