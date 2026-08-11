import React from 'react';
import { motion } from 'framer-motion';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'blue' | 'green' | 'red' | 'yellow';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  color = 'blue',
}) => {
  const borderColors = {
    blue: 'border-blue-500/30 hover:border-blue-500',
    green: 'border-emerald-500/30 hover:border-emerald-500',
    red: 'border-rose-500/30 hover:border-rose-500',
    yellow: 'border-amber-500/30 hover:border-amber-500',
  };

  const textColors = {
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    red: 'text-rose-400',
    yellow: 'text-amber-400',
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className={`p-5 rounded-xl bg-surface-secondary border ${borderColors[color]} shadow-lg transition-all`}
    >
      <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
        {label}
      </span>
      <div className={`text-3xl font-extrabold mt-2 ${textColors[color]}`}>
        {value}
      </div>
      {subValue && (
        <p className="text-xs text-slate-400 mt-1 font-medium">{subValue}</p>
      )}
    </motion.div>
  );
};