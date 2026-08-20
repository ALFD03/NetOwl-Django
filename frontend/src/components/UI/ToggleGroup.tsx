import React from 'react';

interface Option {
  key: string;
  label: string;
  icon?: any;
}

interface Props {
  options: Option[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

const renderIcon = (Icon: any) => {
  if (!Icon) return null;
  // If it's already a React element, clone it to ensure className
  if (React.isValidElement(Icon)) {
    const el = Icon as React.ReactElement;
    // Preserve any existing className, otherwise apply defaults
    const props = { className: el.props?.className ?? 'w-4 h-4' };
    return React.cloneElement(el, props);
  }

  // Try to create element from the component (works with functions and forwardRef objects)
  try {
    return React.createElement(Icon, { className: 'w-4 h-4' });
  } catch (err) {
    // Fallback: if it's already some renderable node, return as-is
    return Icon;
  }
};

export const ToggleGroup: React.FC<Props> = ({ options, activeKey, onChange, className = '' }) => {
  return (
    <div className={`flex gap-2 ${className}`}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = activeKey === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${isActive ? 'bg-brand text-white shadow-lg shadow-brand/30 scale-105' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            {renderIcon(Icon)}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ToggleGroup;
