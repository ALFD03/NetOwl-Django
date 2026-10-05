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
import { buildTramosChartData, colorTramo, tramosChartOptions } from '../../charts/lifetimeChart';
import type { LifetimeMes, LifetimeTramo } from '../../types';

/** El % acumulado al cerrar el tramo que termina en `dias`, si se llegó a él. */
const acumuladoHasta = (tramos: LifetimeTramo[], dias: number): number | null =>
  tramos.find((t) => t.hasta === dias)?.pct_acumulado ?? null;

const formatPct = (value: number | null): string => (value === null ? '—' : `${value}%`);

/** Una fila por tramo: su barra, cuántas bajas y qué parte ya se había ido. */
function DistribucionTramos({ tramos }: { tramos: LifetimeTramo[] }) {
  const maximo = Math.max(1, ...tramos.map((t) => t.pct));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[88px_1fr_64px_64px] gap-3 px-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
        <span>Tramo</span>
        <span>Bajas</span>
        <span className="text-right">%</span>
        <span className="text-right">Acum.</span>
      </div>
      {tramos.map((t, i) => {
        const color = colorTramo(i, tramos.length);
        return (
          <div
            key={t.tramo}
            className="grid grid-cols-[88px_1fr_64px_64px] items-center gap-3 rounded-xl bg-slate-900/40 px-1 py-2"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              {t.tramo}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(t.pct / maximo) * 100}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-12 text-right text-xs tabular-nums text-slate-300">{formatInteger(t.bajas)}</span>
            </div>
            <span className="text-right text-xs font-black tabular-nums" style={{ color }}>{t.pct}%</span>
            <span className="text-right text-xs tabular-nums text-slate-400">{t.pct_acumulado}%</span>
          </div>
        );
      })}
    </div>
  );
}

export function LifetimeTramosPanel({ lifetime }: { lifetime: LifetimeMes }) {
  const tramos = lifetime.tramos;
  const total = lifetime.resumen.n;

  const chartData = useMemo(() => buildTramosChartData(tramos), [tramos]);
  const chartOptions = useMemo(() => tramosChartOptions(tramos), [tramos]);

  const pico = tramos.reduce<LifetimeTramo | null>(
    (mayor, t) => (!mayor || t.bajas > mayor.bajas ? t : mayor),
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
              value={formatPct(acumuladoHasta(tramos, 30))}
              color="red"
              subValue="0–30 días desde la instalación"
            />
            <MetricCard
              label="En sus primeros 90 días"
              value={formatPct(acumuladoHasta(tramos, 90))}
              color="yellow"
              subValue="Acumulado hasta los 90 días"
            />
            <MetricCard
              label="Tramo con más bajas"
              value={pico ? pico.tramo : '—'}
              color="blue"
              subValue={pico ? `${formatInteger(pico.bajas)} bajas · ${pico.pct}%` : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <BarChart data={chartData} options={chartOptions} className="h-80 w-full" />
            </div>
            <div className="xl:col-span-2">
              <DistribucionTramos tramos={tramos} />
            </div>
          </div>
        </div>
      )}
    </NeonContainer>
  );
}
