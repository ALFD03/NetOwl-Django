import { cn } from '@/shared/lib/cn';
import { StatTile, type StatTileProps } from '../metrics/StatTile';

export interface SummaryStripItem extends Omit<StatTileProps, 'variant' | 'size' | 'mono'> {
  /** Stable React key; the label is usually fine. */
  id: string;
}

export interface SummaryStripProps {
  items: SummaryStripItem[];
  /** Columns from the `md` breakpoint up. Below it the strip is 2-up. */
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** Applies tabular figures to every value. */
  mono?: boolean;
  className?: string;
}

// Written out rather than interpolated so Tailwind's scanner can see each class.
const COLUMNS: Record<NonNullable<SummaryStripProps['columns']>, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  7: 'md:grid-cols-7',
  8: 'md:grid-cols-8',
  9: 'md:grid-cols-9',
};

/**
 * Inset row of headline figures that tops a report section.
 *
 * `SalesReport` and `BusinessUnits` each carried their own verbatim copy of this
 * seven-cell block; they now differ only by the `items` they pass.
 */
export function SummaryStrip({ items, columns = 7, mono = false, className }: SummaryStripProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 rounded-2xl border border-slate-800/50 bg-surface-primary p-4 shadow-inner',
        COLUMNS[columns],
        className,
      )}
    >
      {items.map(({ id, ...tile }) => (
        <StatTile key={id} {...tile} mono={mono} size="sm" />
      ))}
    </div>
  );
}
