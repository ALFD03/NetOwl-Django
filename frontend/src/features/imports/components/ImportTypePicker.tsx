/** Qué export se va a cargar, cuando una pantalla de importación admite varios. */

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function ImportTypePicker<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-surface-tertiary p-3 text-xs font-semibold text-slate-200"
        >
          <input
            type="radio"
            name="importType"
            className="text-brand"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
