import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export type SectionAccent = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'slate' | 'brand';

export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Colour of the left rule and the icon. */
  accent?: SectionAccent;
  className?: string;
}

const ACCENT_BORDER: Record<SectionAccent, string> = {
  blue: 'border-sky-500',
  green: 'border-emerald-500',
  yellow: 'border-amber-500',
  red: 'border-rose-500',
  purple: 'border-purple-500',
  slate: 'border-slate-500',
  brand: 'border-brand',
};

const ACCENT_TEXT: Record<SectionAccent, string> = {
  blue: 'text-sky-400',
  green: 'text-emerald-400',
  yellow: 'text-amber-400',
  red: 'text-rose-400',
  purple: 'text-purple-400',
  slate: 'text-slate-400',
  brand: 'text-brand',
};

/** Accent-ruled heading that opens a major section of a page. */
export function SectionHeading({ title, subtitle, icon, accent = 'brand', className }: SectionHeadingProps) {
  return (
    <div className={cn('flex items-center gap-3 border-l-4 pl-4', ACCENT_BORDER[accent], className)}>
      {icon && <span className={cn('[&>svg]:h-6 [&>svg]:w-6', ACCENT_TEXT[accent])}>{icon}</span>}
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight text-white">{title}</h2>
        {subtitle && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
