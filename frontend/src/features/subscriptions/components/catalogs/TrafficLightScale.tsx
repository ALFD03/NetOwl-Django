/**
 * El semáforo de una métrica dibujado como una barra: rojo, amarillo y verde,
 * con los dos umbrales marcados encima.
 *
 * Lo usan la pestaña de objetivos (para leer el semáforo de un vistazo) y el
 * formulario que lo edita (para ver el efecto mientras se escribe).
 */

import { cn } from '@/shared/lib/cn';
import { formatTarget } from '../../lib/targets';

export type TrafficLightMetric = 'crecimiento' | 'churn' | 'cumplimiento';

interface Tier {
  tone: 'red' | 'yellow' | 'green';
  since: number;
  until: number;
  text: string;
}

const TIER_COLOR: Record<Tier['tone'], { bar: string; chip: string; dot: string }> = {
  red: { bar: 'bg-rose-500/80', chip: 'text-rose-300', dot: 'bg-rose-500' },
  yellow: { bar: 'bg-amber-400/85', chip: 'text-amber-300', dot: 'bg-amber-400' },
  green: { bar: 'bg-emerald-500/85', chip: 'text-emerald-300', dot: 'bg-emerald-500' },
};

const TONE_NAME: Record<Tier['tone'], string> = { red: 'Rojo', yellow: 'Amarillo', green: 'Verde' };

/** Un número a medio escribir (`NaN`) se dibuja como 0 en vez de romper la barra. */
const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * Los tres tramos de la métrica sobre un rango de dibujo con margen a los dos
 * lados, para que ningún color quede reducido a una raya.
 */
function tiers(metric: TrafficLightMetric, rawGreen: number, rawYellow: number) {
  const green = finite(rawGreen);
  const yellow = finite(rawYellow);
  const f = formatTarget;

  if (metric === 'churn') {
    // Menos es mejor: verde desde 0 hasta `green`, amarillo hasta `yellow`.
    const until = Math.max(yellow, green) + Math.max(Math.abs(yellow - green), 2);
    return {
      start: 0,
      end: until,
      marks: [green, yellow],
      bands: [
        { tone: 'green', since: 0, until: green, text: `≤ ${f(green)}` },
        { tone: 'yellow', since: green, until: yellow, text: `${f(green)} – ${f(yellow)}` },
        { tone: 'red', since: yellow, until, text: `> ${f(yellow)}` },
      ] as Tier[],
    };
  }

  // Más es mejor: rojo por debajo de `yellow`, amarillo hasta `green`, verde desde `green`.
  const gap = Math.max(Math.abs(green - yellow), metric === 'cumplimiento' ? 20 : 2);
  const since = metric === 'cumplimiento' ? 0 : Math.min(yellow, green) - gap;
  const end = Math.max(green, yellow) + gap;
  return {
    start: since,
    end,
    marks: [yellow, green],
    bands: [
      { tone: 'red', since, until: yellow, text: `< ${f(yellow)}` },
      { tone: 'yellow', since: yellow, until: green, text: `${f(yellow)} – ${f(green)}` },
      { tone: 'green', since: green, until: end, text: `≥ ${f(green)}` },
    ] as Tier[],
  };
}

export interface TrafficLightScaleProps {
  metric: TrafficLightMetric;
  green: number;
  yellow: number;
  className?: string;
}

export function TrafficLightScale({ metric, green, yellow, className }: TrafficLightScaleProps) {
  const scale = tiers(metric, green, yellow);
  const range = scale.end - scale.start || 1;
  const position = (value: number) =>
    Math.min(100, Math.max(0, ((value - scale.start) / range) * 100));

  return (
    <div className={cn('space-y-3', className)}>
      {/* Los umbrales, encima de la barra, en su posición real. */}
      <div className="relative h-4">
        {scale.marks.map((mark, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 text-[10px] font-black text-white"
            style={{ left: `${position(finite(mark))}%` }}
          >
            {formatTarget(finite(mark))}
          </span>
        ))}
      </div>

      <div className="relative">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
          {scale.bands.map((tier) => (
            <div
              key={tier.tone}
              className={cn('h-full transition-all', TIER_COLOR[tier.tone].bar)}
              style={{ width: `${Math.max(0, position(tier.until) - position(tier.since))}%` }}
            />
          ))}
        </div>
        {scale.marks.map((mark, i) => (
          <span
            key={i}
            className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded-full bg-white/80"
            style={{ left: `${position(finite(mark))}%` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {scale.bands.map((tier) => (
          <div key={tier.tone} className="flex items-center gap-1.5 text-[10px]">
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', TIER_COLOR[tier.tone].dot)} />
            <span className={cn('font-black uppercase tracking-wider', TIER_COLOR[tier.tone].chip)}>
              {TONE_NAME[tier.tone]}
            </span>
            <span className="truncate text-slate-400">{tier.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
