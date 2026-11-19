/**
 * Opciones en fichas para marcar: una (`radio`) o varias (`checkbox`).
 *
 * Para elegir entre respuestas que se leen enteras. Para cambiar de vista va
 * `ToggleGroup`; para una lista larga, `SelectMenu`.
 */

import { cn } from '@/shared/lib/cn';

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
}

export interface ChoiceChipsProps<T extends string | number> {
  options: ChoiceOption<T>[];
  selected: T[];
  /** Con `multiple`, marcar suma o quita; sin él, reemplaza (y volver a pulsar desmarca). */
  multiple?: boolean;
  onChange: (selected: T[]) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function ChoiceChips<T extends string | number>({
  options,
  selected,
  multiple = false,
  onChange,
  disabled = false,
  className,
  ...aria
}: ChoiceChipsProps<T>) {
  const toggle = (value: T) => {
    const isOn = selected.includes(value);
    if (multiple) onChange(isOn ? selected.filter((v) => v !== value) : [...selected, value]);
    else onChange(isOn ? [] : [value]);
  };

  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={aria['aria-label']} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const isOn = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={isOn}
            disabled={disabled}
            onClick={() => toggle(o.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
              isOn
                ? 'border-brand bg-brand text-white shadow-md shadow-brand/20'
                : 'border-slate-700 bg-surface-tertiary text-slate-300 hover:border-slate-500 hover:text-white',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
