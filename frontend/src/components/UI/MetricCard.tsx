import React from 'react';
import { motion } from 'framer-motion';
import { 
  Users, CheckCircle2, XCircle, Clock, 
  AlertTriangle, Zap, Trophy, TrendingUp 
} from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate';
  icon?: React.ReactNode;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  color = 'blue',
  icon,
}) => {
  // Paletas de estilo exactas a las de tu captura: Degradados + Bordes + Sombras Glow
  const themeStyles = {
    slate: {
      card: 'bg-gradient-to-br from-slate-800/80 via-slate-900 to-slate-950 border-slate-600/50 shadow-slate-950/40',
      label: 'text-slate-400',
      value: 'text-white',
      defaultIcon: <Users className="w-4 h-4 text-slate-300" />,
    },
    green: {
      card: 'bg-gradient-to-br from-emerald-950/40 via-surface-secondary to-[#0b1326] border-emerald-500/40 shadow-emerald-950/30',
      label: 'text-emerald-400',
      value: 'text-emerald-400',
      defaultIcon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    },
    red: {
      card: 'bg-gradient-to-br from-rose-950/40 via-surface-secondary to-[#0b1326] border-rose-500/40 shadow-rose-950/30',
      label: 'text-rose-400',
      value: 'text-rose-400',
      defaultIcon: <XCircle className="w-4 h-4 text-rose-400" />,
    },
    blue: {
      card: 'bg-gradient-to-br from-sky-950/40 via-surface-secondary to-[#0b1326] border-sky-500/40 shadow-sky-950/30',
      label: 'text-sky-400',
      value: 'text-sky-400',
      defaultIcon: <Clock className="w-4 h-4 text-sky-400" />,
    },
    yellow: {
      card: 'bg-gradient-to-br from-amber-950/40 via-surface-secondary to-[#0b1326] border-amber-500/40 shadow-amber-950/30',
      label: 'text-amber-400',
      value: 'text-amber-400',
      defaultIcon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    },
    purple: {
      card: 'bg-gradient-to-br from-purple-950/40 via-surface-secondary to-[#0b1326] border-purple-500/40 shadow-purple-950/30',
      label: 'text-purple-400',
      value: 'text-purple-400',
      defaultIcon: <Zap className="w-4 h-4 text-purple-400" />,
    },
  };

  const currentTheme = themeStyles[color] || themeStyles.blue;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`p-5 rounded-3xl border shadow-xl flex flex-col justify-between transition-all ${currentTheme.card}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-black uppercase tracking-wider ${currentTheme.label}`}>
          {label}
        </span>
        <div className="opacity-80">
          {icon || currentTheme.defaultIcon}
        </div>
      </div>

      <div className={`text-3xl font-black tracking-tight ${currentTheme.value}`}>
        {value}
      </div>

      {subValue && (
        <p className="text-[10px] font-bold text-slate-400 mt-1 truncate">
          {subValue}
        </p>
      )}
    </motion.div>
  );
};