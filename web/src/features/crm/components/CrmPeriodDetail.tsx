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
import { buildHealthCards } from '../lib/crmEfectividad';
import type { CrmCierre } from '../types';

interface CrmPeriodDetailProps {
  row: CrmCierre;
}

/** Keys of a cierre row that hold a plain number — the only ones an SLA reads. */
type CrmNumericKey = {
  [K in keyof CrmCierre]: CrmCierre[K] extends number ? K : never;
}[keyof CrmCierre];

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
    promedio: CrmNumericKey;
    mediana: CrmNumericKey;
    p25: CrmNumericKey;
    p75: CrmNumericKey;
    min: CrmNumericKey;
    max: CrmNumericKey;
    std: CrmNumericKey;
    excedeProm: CrmNumericKey;
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
      promedio: 'horas_promedio_inst',
      mediana: 'horas_mediana_inst',
      p25: 'horas_p25_inst',
      p75: 'horas_p75_inst',
      min: 'horas_min_inst',
      max: 'horas_max_inst',
      std: 'horas_std_inst',
      excedeProm: 'pct_excede_prom_inst',
    },
  },
  {
    id: 'perdida',
    title: 'SLA Pérdida (Horas)',
    subtitle: 'Ingreso → caída',
    tone: 'red',
    icon: <Clock className="h-3.5 w-3.5" />,
    keys: {
      promedio: 'horas_promedio_perd',
      mediana: 'horas_mediana_perd',
      p25: 'horas_p25_perd',
      p75: 'horas_p75_perd',
      min: 'horas_min_perd',
      max: 'horas_max_perd',
      std: 'horas_std_perd',
      excedeProm: 'pct_excede_prom_perd',
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
      promedio: 'horas_promedio_cierre',
      mediana: 'horas_mediana_cierre',
      p25: 'horas_p25_cierre',
      p75: 'horas_p75_cierre',
      min: 'horas_min_cierre',
      max: 'horas_max_cierre',
      std: 'horas_std_cierre',
      excedeProm: 'pct_excede_prom_cierre',
    },
  },
];

/** Body of the Results modal: the executive summary for one closed cohort. */
export function CrmPeriodDetail({ row }: CrmPeriodDetailProps) {
  const totalClosed = toNumber(row.ganados) + toNumber(row.perdidos);
  // Las devoluciones no comparten denominador con el resto de la tira: ganados,
  // perdidos y pendientes son la cohorte de creación y la etapa 8 es el riesgo
  // del mes sobre todo lo que estuvo vivo. Por eso su caption dice contra qué se
  // mide, y por eso ya no se suma con la pérdida en un único "fuga": serían dos
  // porcentajes de bases distintas.
  const e8Excepciones = toNumber(row.e8_devueltos_excepcion);
  const e8Caption = `${row.pct_devueltos_e8}% de ${formatInteger(row.total_en_riesgo)} vivas`;
  const e8BrutoCaption = e8Excepciones > 0
    ? `${formatInteger(e8Excepciones)} ajenas excluidas`
    : 'Sin motivos ajenos';
  const healthCards = buildHealthCards(row.efectividad);

  const summary: SummaryStripItem[] = [
    { id: 'oportunidades', label: 'Oportunidades', value: formatInteger(row.total_oportunidades), caption: 'Cohorte del periodo', tone: 'white' },
    { id: 'ganados', label: 'Ganados', value: `+${formatInteger(row.ganados)}`, caption: `${row.pct_instalacion}% instalación`, tone: 'green' },
    { id: 'perdidos', label: 'Perdidos', value: `-${formatInteger(row.perdidos)}`, caption: `${row.pct_perdida}% pérdida`, tone: 'red' },
    { id: 'pendientes', label: 'Pendientes', value: formatInteger(row.pendientes), caption: `${row.pct_pendientes}% en curso`, tone: 'blue' },
    { id: 'devueltos', label: 'Devueltos E8', value: formatInteger(row.count_devueltos_e8), caption: e8Caption, tone: 'yellow' },
    { id: 'devueltos_bruto', label: 'Devueltos E8 (bruto)', value: formatInteger(row.count_devueltos_e8_bruto), caption: e8BrutoCaption, tone: 'red' },
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
              <CompactMetric label="Promedio (μ)" value={`${formatOneDecimal(row[keys.promedio])} h`} color={tone} />
              <CompactMetric label="Mediana (P50)" value={`${formatOneDecimal(row[keys.mediana])} h`} color="yellow" />
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
                  pct={row[keys.excedeProm]}
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
