import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  /** Logo image or a framed icon, shown above the title. */
  brand?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Centred card for the full-screen, chrome-less auth pages. */
export function AuthCard({ title, subtitle, brand, children, className }: AuthCardProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-primary p-4">
      <div
        className={cn(
          'w-full max-w-md rounded-2xl border border-slate-800 bg-surface-secondary p-8 shadow-2xl',
          className,
        )}
      >
        <div className="mb-8 text-center">
          {brand && <div className="mb-4 flex justify-center">{brand}</div>}
          <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
