
interface Props {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
}

export function SearchInput({ value, placeholder = 'Buscar...', onChange, className = '' }: Props) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-surface-primary border-slate-700/60 px-4 py-2.5 text-xs text-white outline-none focus:border-brand ${className}`}
    />
  );
}
