/**
 * «¿Cuándo se van?»: en qué momento de su vida se dieron de baja las
 * suscripciones del mes instaladas desde 2026.
 *
 * Tres hitos arriba (primer mes, primeros 90 días, el tramo con más bajas), el
 * gráfico de barras con su acumulado y, al lado, la distribución fila a fila.
 */

import { useMemo } from 'react';
import { CalendarClock, Hourglass } from 'lucide-react';

import { BarChart } from '@/shared/charts';
import { EmptyState, MetricCard, NeonContainer } from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';
import { buildTiersChartData, tierColor, tiersChartOptions } from '../../charts/lifetimeChart';
import type { LifetimeMonth, LifetimeTier } from '../../types';

/** El % acumulado al cerrar el tramo que termina en `dias`, si se llegó a él. */
const accumulatedUntil = (tiers: LifetimeTier[], days: number): number | null =>
  tiers.find((t) => t.until === days)?.cumulative_pct ?? null;

const formatPct = (value: number | null): string => (value === null ? '—' : `${value}%`);

/** Una fila por tramo: su barra, cuántas bajas y qué parte ya se había ido. */
function TierDistribution({ buckets }: { buckets: LifetimeTier[] }) {
  const max = Math.max(1, ...buckets.map((t) => t.pct));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[88px_1fr_64px_64px] gap-3 px-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
        <span>Tramo</span>
        <span>Bajas</span>
        <span className="text-right">%</span>
        <span className="text-right">Acum.</span>
      </div>
      {buckets.map((t, i) => {
        const color = tierColor(i, buckets.length);
        return (
          <div
            key={t.bucket}
            className="grid grid-cols-[88px_1fr_64px_64px] items-center gap-3 rounded-xl bg-slate-900/40 px-1 py-2"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              {t.bucket}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(t.pct / max) * 100}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-12 text-right text-xs tabular-nums text-slate-300">{formatInteger(t.churned)}</span>
            </div>
            <span className="text-right text-xs font-black tabular-nums" style={{ color }}>{t.pct}%</span>
            <span className="text-right text-xs tabular-nums text-slate-400">{t.cumulative_pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function LifetimeTiersPanel({ lifetime }: { lifetime: LifetimeMonth }) {
  const tiers = lifetime.buckets;
  const total = lifetime.summary.n;

  const chartData = useMemo(() => buildTiersChartData(tiers), [tiers]);
  const chartOptions = useMemo(() => tiersChartOptions(tiers), [tiers]);

  const peak = tiers.reduce<LifetimeTier | null>(
    (largest, t) => (!largest || t.churned > largest.churned ? t : largest),
    null,
  );

  return (
    <NeonContainer
      theme="cyan"
      title="¿Cuándo se van?"
      subtitle={`Cuánto llevaban instaladas al darse de baja · ${formatInteger(total)} bajas instaladas desde 2026`}
      icon={<Hourglass className="h-5 w-5" />}
    >
      {total === 0 ? (
        <EmptyState
          title="Ninguna baja de este mes se instaló desde 2026"
          description="Las bajas de enero de 2026 estaban activas el día 1, así que ninguna se instaló en 2026."
          icon={<CalendarClock />}
          size="md"
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              label="Se fueron en su primer mes"
              value={formatPct(accumulatedUntil(tiers, 30))}
              color="red"
              subValue="0–30 días desde la instalación"
            />
            <MetricCard
              label="En sus primeros 90 días"
              value={formatPct(accumulatedUntil(tiers, 90))}
              color="yellow"
              subValue="Acumulado hasta los 90 días"
            />
            <MetricCard
              label="Tramo con más bajas"
              value={peak ? peak.bucket : '—'}
              color="blue"
              subValue={peak ? `${formatInteger(peak.churned)} bajas · ${peak.pct}%` : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <BarChart data={chartData} options={chartOptions} className="h-80 w-full" />
            </div>
            <div className="xl:col-span-2">
              <TierDistribution buckets={tiers} />
            </div>
          </div>
        </div>
      )}
    </NeonContainer>
  );
}
