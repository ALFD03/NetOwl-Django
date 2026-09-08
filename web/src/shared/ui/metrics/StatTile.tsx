import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { METRIC_TEXT } from '../theme/metricTheme';
import type { MetricColor } from '../theme/types';

export type StatTileVariant = 'plain' | 'boxed';
export type StatTileTone = MetricColor | 'brand' | 'white';
export type StatTileSize = 'sm' | 'md' | 'lg';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Optional third line under the value, e.g. a unit or a comparison. */
  caption?: string;
  /** `plain` is a bare label/value pair for dense strips; `boxed` adds a card. */
  variant?: StatTileVariant;
  tone?: StatTileTone;
  size?: StatTileSize;
  /** Tabular figures — use for anything the eye scans down a column. */
  mono?: boolean;
  /** Draws a left rule, to separate a group inside a strip. */
  divided?: boolean;
  className?: string;
}

const TONES: Record<StatTileTone, string> = {
  ...METRIC_TEXT,
  brand: 'text-brand',
  white: 'text-white',
};

const SIZES: Record<StatTileSize, { value: string; label: string }> = {
  sm: { value: 'text-sm', label: 'text-[9px]' },
  md: { value: 'text-lg', label: 'text-[9px]' },
  lg: { value: 'text-2xl', label: 'text-[10px] tracking-widest' },
};

/**
 * A single label/value readout.
 *
 * This is the component the codebase kept re-inlining: a `flex flex-col` with a
 * tiny uppercase label over a bold value, written 14 different times with
 * drifting sizes and colours.
 */
export function StatTile({
  label,
  value,
  caption,
  variant = 'plain',
  tone = 'white',
  size = 'sm',
  mono = false,
  divided = false,
  className,
}: StatTileProps) {
  const styles = SIZES[size];

  return (
    <div
      className={cn(
        'flex flex-col',
        variant === 'boxed' && 'rounded-2xl border border-slate-800 bg-slate-950/30 p-4',
        divided && 'border-l border-slate-800/50 pl-4',
        className,
      )}
    >
      <span className={cn('font-black uppercase text-slate-500', styles.label)}>{label}</span>
      <span
        className={cn(
          'font-black tracking-tight',
          styles.value,
          TONES[tone],
          mono && 'font-mono',
          variant === 'boxed' && 'mt-2',
        )}
      >
        {value}
      </span>
      {caption && <span className="mt-1 text-xs text-slate-500">{caption}</span>}
    </div>
  );
}
