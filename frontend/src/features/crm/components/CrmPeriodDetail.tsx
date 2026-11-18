/** El detalle de un cierre de CRM: volúmenes, tasas, tiempos y efectividad. */

import type { ReactNode } from 'react';
import { Clock, Layers, Timer, TrendingDown, Zap } from 'lucide-react';

import { METRIC_COLOR } from '@/shared/constants/theme';
import {
  CompactMetric,
  MetricCard,
  MetricGroup,
  MiniExceedRing,
  ProgressBar,
  SectionHeading,
  SummaryStrip,
  type MetricColor,
  type SummaryStripItem,
} from '@/shared/ui';
import { formatInteger, formatOneDecimal, toNumber } from '@/shared/utils';
import { buildHealthCards } from '../lib/crmEffectiveness';
import type { CrmClose } from '../types';

interface CrmPeriodDetailProps {
  row: CrmClose;
}

/** Keys of a cierre row that hold a plain number — the only ones an SLA reads. */
type CrmNumericKey = {
  [K in keyof CrmClose]: CrmClose[K] extends number ? K : never;
}[keyof CrmClose];

/** One of the three time distributions of a cohort: installation, loss, or both. */
interface SlaSection {
  id: string;
  /** Spans the full grid row — for the aggregate that summarises the pair. */
  wide?: boolean;
  title: string;
  subtitle: string;
  tone: MetricColor;
  icon: ReactNode;
  keys: {
    avg: CrmNumericKey;
    median: CrmNumericKey;
    p25: CrmNumericKey;
    p75: CrmNumericKey;
    min: CrmNumericKey;
    max: CrmNumericKey;
    std: CrmNumericKey;
    pctOverAvg: CrmNumericKey;
  };
}

const SLA_SECTIONS: SlaSection[] = [
  {
    id: 'instalacion',
    title: 'SLA Instalación (Horas)',
    subtitle: 'Ingreso → instalación',
    tone: 'blue',
    icon: <Zap className="h-3.5 w-3.5" />,
    keys: {
      avg: 'hours_avg_inst',
      median: 'hours_median_inst',
      p25: 'hours_p25_inst',
      p75: 'hours_p75_inst',
      min: 'hours_min_inst',
      max: 'hours_max_inst',
      std: 'hours_std_inst',
      pctOverAvg: 'pct_over_avg_inst',
    },
  },
  {
    id: 'perdida',
    title: 'SLA Pérdida (Horas)',
    subtitle: 'Ingreso → caída',
    tone: 'red',
    icon: <Clock className="h-3.5 w-3.5" />,
    keys: {
      avg: 'hours_avg_lost',
      median: 'hours_median_lost',
      p25: 'hours_p25_lost',
      p75: 'hours_p75_lost',
      min: 'hours_min_lost',
      max: 'hours_max_lost',
      std: 'hours_std_lost',
      pctOverAvg: 'pct_over_avg_lost',
    },
  },
  {
    id: 'cierre',
    wide: true,
    title: 'SLA Cierre (Horas)',
    subtitle: 'Ingreso → cierre (instalados + perdidos)',
    tone: 'yellow',
    icon: <Timer className="h-3.5 w-3.5" />,
    keys: {
      avg: 'hours_avg_close',
      median: 'hours_median_close',
      p25: 'hours_p25_close',
      p75: 'hours_p75_close',
      min: 'hours_min_close',
      max: 'hours_max_close',
      std: 'hours_std_close',
      pctOverAvg: 'pct_over_avg_close',
    },
  },
];

/** Body of the Results modal: the executive summary for one closed cohort. */
export function CrmPeriodDetail({ row }: CrmPeriodDetailProps) {
  const totalClosed = toNumber(row.won) + toNumber(row.lost);
  // Las devoluciones no comparten denominador con el resto de la tira: ganados,
  // perdidos y pendientes son la cohorte de creación y la etapa 8 es el riesgo
  // del mes sobre todo lo que estuvo vivo. Por eso su caption dice contra qué se
  // mide, y por eso ya no se suma con la pérdida en un único "fuga": serían dos
  // porcentajes de bases distintas.
  const e8Exceptions = toNumber(row.e8_returned_exception);
  const e8Caption = `${row.pct_returned_e8}% de ${formatInteger(row.total_at_risk)} vivas`;
  const e8GrossCaption = e8Exceptions > 0
    ? `${formatInteger(e8Exceptions)} ajenas excluidas`
    : 'Sin motivos ajenos';
  const healthCards = buildHealthCards(row.effectiveness);

  const summary: SummaryStripItem[] = [
    { id: 'opportunities', label: 'Oportunidades', value: formatInteger(row.total_opportunities), caption: 'Cohorte del periodo', tone: 'white' },
    { id: 'won', label: 'Ganados', value: `+${formatInteger(row.won)}`, caption: `${row.pct_installation}% instalación`, tone: 'green' },
    { id: 'lost', label: 'Perdidos', value: `-${formatInteger(row.lost)}`, caption: `${row.pct_lost}% pérdida`, tone: 'red' },
    { id: 'pending', label: 'Pendientes', value: formatInteger(row.pending), caption: `${row.pct_pending}% en curso`, tone: 'blue' },
    { id: 'devueltos', label: 'Devueltos E8', value: formatInteger(row.count_returned_e8), caption: e8Caption, tone: 'yellow' },
    { id: 'devueltos_bruto', label: 'Devueltos E8 (bruto)', value: formatInteger(row.count_returned_e8_gross), caption: e8GrossCaption, tone: 'red' },
    { id: 'cierres', label: 'Cierres Totales', value: formatInteger(totalClosed), caption: 'Ganados + perdidos', tone: 'slate' },
  ];

  return (
    <div className="space-y-6">
      <SummaryStrip items={summary} columns={7} mono />

      {healthCards.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            title="Efectividad por Etapa"
            subtitle="Rendimiento del embudo en el periodo"
            icon={<Layers />}
            accent="green"
          />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {healthCards.map((card) => (
              <MetricCard
                key={card.id}
                label={card.label}
                value={`${card.pct}%`}
                caption="Tasa de Conversión"
                color={card.color}
                indicator
              >
                <ProgressBar label={`Exitosos (${card.successCount})`} percent={card.successPct} valueLabel={`${card.successPct}%`} color="green" />
                <ProgressBar label={`Caídas (${card.failCount})`} percent={card.failPct} valueLabel={`${card.failPct}%`} color="red" />
              </MetricCard>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeading
          title="Distribución de Tiempos"
          subtitle="Lead time en horas y dispersión de los cierres"
          icon={<TrendingDown />}
          accent="blue"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SLA_SECTIONS.map(({ id, wide, title, subtitle, tone, icon, keys }) => (
            <div key={id} className={wide ? 'md:col-span-2' : undefined}>
            <MetricGroup title={title} tone={tone} icon={icon} columns={3}>
              <CompactMetric label="Promedio (μ)" value={`${formatOneDecimal(row[keys.avg])} h`} color={tone} />
              <CompactMetric label="Mediana (P50)" value={`${formatOneDecimal(row[keys.median])} h`} color="yellow" />
              <CompactMetric label="Desv. Std (σ)" value={`${formatOneDecimal(row[keys.std])} h`} color="purple" />
              <CompactMetric label="P25" value={`${formatOneDecimal(row[keys.p25])} h`} color={tone} />
              <CompactMetric label="P75" value={`${formatOneDecimal(row[keys.p75])} h`} color={tone} />
              <CompactMetric
                label="Min / Max"
                value={`${formatInteger(row[keys.min])} / ${formatInteger(row[keys.max])}h`}
                color="slate"
              />

              <div className="col-span-3 mt-1 space-y-1.5 border-t border-slate-800 pt-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                  {subtitle} · casos fuera del estándar
                </p>
                <MiniExceedRing
                  label="Excede Promedio"
                  pct={row[keys.pctOverAvg]}
                  color={METRIC_COLOR[tone]}
                />
              </div>
            </MetricGroup>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
