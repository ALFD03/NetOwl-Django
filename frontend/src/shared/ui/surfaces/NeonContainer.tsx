import type { ReactNode, FC } from 'react';
import type { NeonTheme } from '../theme/types';

export type { NeonTheme };

interface NeonContainerProps {
  children: ReactNode;
  theme?: NeonTheme;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const NeonContainer: FC<NeonContainerProps> = ({
  children,
  theme = 'slate',
  title,
  subtitle,
  icon,
  headerAction,
  className = '',
  noPadding = false,
}) => {
  const themeStyles: Record<NeonTheme, { card: string; title: string; iconBg: string }> = {
    slate: {
      card: 'bg-gradient-to-br from-slate-800/80 via-slate-900 to-slate-950 border-slate-600/40 shadow-slate-950/40',
      title: 'text-white',
      iconBg: 'bg-slate-800 text-slate-300 border-slate-700',
    },
    green: {
      card: 'bg-gradient-to-br from-emerald-950/30 via-surface-secondary to-surface-primary border-emerald-500/40 shadow-emerald-950/20',
      title: 'text-white',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    },
    red: {
      card: 'bg-gradient-to-br from-rose-950/30 via-surface-secondary to-surface-primary border-rose-500/40 shadow-rose-950/20',
      title: 'text-white',
      iconBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    },
    blue: {
      card: 'bg-gradient-to-br from-sky-950/30 via-surface-secondary to-surface-primary border-sky-500/40 shadow-sky-950/20',
      title: 'text-white',
      iconBg: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    },
    yellow: {
      card: 'bg-gradient-to-br from-amber-950/30 via-surface-secondary to-surface-primary border-amber-500/40 shadow-amber-950/20',
      title: 'text-white',
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    },
    purple: {
      card: 'bg-gradient-to-br from-purple-950/30 via-surface-secondary to-surface-primary border-purple-500/40 shadow-purple-950/20',
      title: 'text-white',
      iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    },
    cyan: {
      card: 'bg-gradient-to-br from-cyan-950/30 via-surface-secondary to-surface-primary border-cyan-500/40 shadow-cyan-950/20',
      title: 'text-white',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    },
  };

  const currentTheme = themeStyles[theme] || themeStyles.slate;

  return (
    <div className={`rounded-3xl border shadow-2xl flex flex-col justify-between overflow-hidden relative ${currentTheme.card} ${className}`}>
      {(title || headerAction) && (
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {icon && (
              <div className={`p-2.5 rounded-2xl border ${currentTheme.iconBg}`}>
                {icon}
              </div>
            )}
            <div>
              {title && <h3 className={`text-xs font-black uppercase tracking-wider ${currentTheme.title}`}>{title}</h3>}
              {subtitle && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6 flex-1'}>
        {children}
      </div>
    </div>
  );
};