/** Tarjeta de KPI: título, valor, variación y color de métrica. */

import type { FC, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Users, CheckCircle2, XCircle, Clock,
  AlertTriangle, Zap, Maximize2, TrendingUp, TrendingDown,
} from 'lucide-react';

import type { MetricColor } from '../theme/types';
import { METRIC_CARD_SURFACE, METRIC_LABEL, METRIC_TEXT } from '../theme/metricTheme';
import { PulseDot } from '../primitives/PulseDot';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  subValue?: string;
  caption?: string;
  color?: MetricColor;
  icon?: ReactNode;
  indicator?: boolean;
  trend?: number;
  onClick?: () => void;
  children?: ReactNode;
}

const defaultIcons: Record<MetricColor, ReactNode> = {
  slate: <Users className="w-4 h-4 text-slate-300" />,
  green: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  red: <XCircle className="w-4 h-4 text-rose-400" />,
  blue: <Clock className="w-4 h-4 text-sky-400" />,
  yellow: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  purple: <Zap className="w-4 h-4 text-purple-400" />,
};

export const MetricCard: FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  caption,
  color = 'blue',
  icon,
  indicator = false,
  trend,
  onClick,
  children,
}) => {
  const isClickable = Boolean(onClick);
  const showTrend = trend != null;
  const isUp = (trend ?? 0) >= 0;

  const accessory = indicator ? (
    <PulseDot color={color} />
  ) : showTrend ? (
    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {(trend ?? 0) > 0 ? `+${trend}%` : `${trend}%`}
    </span>
  ) : (
    <div className="opacity-80">{icon || defaultIcons[color]}</div>
  );

  return (
    <motion.div
      role={isClickable ? 'button' : undefined}
      onClick={onClick}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`group p-5 rounded-3xl border shadow-xl flex flex-col justify-between transition-all relative overflow-hidden ${METRIC_CARD_SURFACE[color]} ${isClickable ? 'cursor-pointer hover:border-brand/60' : ''}`}
    >
      {isClickable && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity pointer-events-none">
          <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
        </div>
      )}

      <div className="flex items-center justify-between mb-2 gap-2">
        <span className={`text-[10px] font-black uppercase tracking-wider truncate ${METRIC_LABEL[color]}`} title={label}>
          {label}
        </span>
        {accessory}
      </div>

      <div>
        <div className={`text-3xl font-black tracking-tight ${METRIC_TEXT[color]}`}>
          {value}
        </div>
        {caption && (
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block -mt-0.5">
            {caption}
          </span>
        )}
      </div>

      {subValue && (
        <p className="text-[10px] font-bold text-slate-400 mt-1 truncate">
          {subValue}
        </p>
      )}

      {children && (
        <div className="space-y-2 pt-2.5 mt-2 border-t border-slate-800/80">
          {children}
        </div>
      )}
    </motion.div>
  );
};
