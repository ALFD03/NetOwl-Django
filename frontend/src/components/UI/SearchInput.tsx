import React from 'react';

interface Props {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
}

export const SearchInput: React.FC<Props> = ({ value, placeholder = 'Buscar...', onChange, className = '' }) => {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-[#0b1326] border-slate-700/60 px-4 py-2.5 text-xs text-white outline-none focus:border-brand ${className}`}
    />
  );
};

export default SearchInput;
