import { isValidElement, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

export interface ToggleOption {
  key: string;
  label: string;
  /** Either a rendered element or a lucide component to instantiate. */
  icon?: ReactNode | LucideIcon;
}

export interface ToggleGroupProps {
  options: ToggleOption[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

function renderIcon(icon?: ReactNode | LucideIcon) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;

  const Icon = icon as LucideIcon;
  return <Icon className="h-4 w-4" aria-hidden />;
}

/** Segmented control for switching between mutually exclusive views. */
export function ToggleGroup({ options, activeKey, onChange, className }: ToggleGroupProps) {
  return (
    <div className={cn('flex gap-2', className)}>
      {options.map((option) => {
        const isActive = activeKey === option.key;

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={isActive}
            className={cn(
              'flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-wider transition-all',
              isActive
                ? 'scale-105 bg-brand text-white shadow-lg shadow-brand/30'
                : 'text-slate-400 hover:bg-white/5 hover:text-white',
            )}
          >
            {renderIcon(option.icon)}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
