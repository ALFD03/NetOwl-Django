import { CheckCircle2, Clock, Hourglass, Timer, XCircle } from 'lucide-react';

import type { TimeMeasureMeta } from './supportMetrics';

/**
 * One icon per measure colour, so the card row stays legible when a measure is
 * split by outcome: the colour already encodes the formula, the icon repeats it
 * for the resolved / cancelled variants that share a clock.
 */
export const MEASURE_ICONS: Record<TimeMeasureMeta['color'], JSX.Element> = {
  blue: <Clock className="h-4 w-4 text-sky-400" />,
  green: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  purple: <Timer className="h-4 w-4 text-purple-400" />,
  red: <XCircle className="h-4 w-4 text-rose-400" />,
  slate: <Hourglass className="h-4 w-4 text-slate-300" />,
};
