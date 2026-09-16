/** El bloque del día: tarjetas día/acumulado y las líneas de tendencia del mes. */

import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';

import { useMemo } from 'react';

import { DayTrendChart, type DayTrendSeries } from '@/shared/charts';
import { diasCalculados, leerDia, serieDe, type MetricKind } from '@/shared/lib/daySeries';
import type { DaySeries } from '@/shared/types/domain';
import { NeonContainer } from '../surfaces/NeonContainer';
import type { MetricColor, NeonTheme } from '../theme/types';
import { DayMetricCard } from './DayMetricCard';

export interface DayCardSpec {
  /** Clave de la métrica dentro del bloque global de cada día. */
  key: string;
  label: string;
  kind: MetricKind;
  color?: MetricColor;
  subValue?: string;
  icon?: ReactNode;
  /** De qué lado está lo bueno. En bajas o churn, subir es malo. */
  trendGoodWhen?: 'up' | 'down';
}

export interface DayChartSpec {
  title: string;
  subtitle?: string;
  /** Dos series como máximo: es una comparación, no un tablero. */
  series: Array<{
    key: string;
    label: string;
    kind: MetricKind;
    color: MetricColor;
    /** De qué lado está lo bueno. En bajas o churn, subir es malo. */
    trendGoodWhen?: 'up' | 'down';
  }>;
  esTasa?: boolean;
}

interface Props {
  serie: DaySeries | undefined;
  /** Los días con corte, ordenados. Puede haber más de los que trae `serie`. */
  dias: number[];
  /** Día elegido en la barra. */
  dia: number;
  cards: DayCardSpec[];
  charts: DayChartSpec[];
  title?: string;
  subtitle?: string;
  theme?: NeonTheme;
}

/**
 * Lo que la barra de días añade a Analytics, en un solo bloque.
 *
 * Todo sale de la serie ligera que ya viajó en los props, así que moverse por el
 * mes no pide nada: cambia el día y se recalcula en memoria. Las tarjetas
 * responden «cuánto ese día y cuánto va del mes»; las líneas, «cómo viene el mes
 * y cómo fue contra ayer».
 *
 * Qué es cada métrica —flujo, nivel o tasa— lo declara cada módulo en su `spec`,
 * porque de eso depende que restar tenga sentido (ver `shared/lib/daySeries`).
 */
export function DaySummary({
  serie,
  dias,
  dia,
  cards,
  charts,
  title = 'El día seleccionado',
  subtitle = 'Lo ocurrido ese día, lo que va del mes y cómo se compara con el día anterior',
  theme = 'purple',
}: Props) {
  // Los días de la barra y los de este bloque no son siempre los mismos: un mes
  // analizado antes de que su módulo guardara el bloque global tiene cortes
  // -el desglose se lee igual- pero nada que resumir aquí.
  const diasSerie = useMemo(() => diasCalculados(serie), [serie]);

  const diaActivo = useMemo(() => {
    if (!diasSerie.length) return 0;
    if (diasSerie.includes(dia)) return dia;
    // Al día elegido le falta el bloque: se cae al último corte anterior que sí
    // lo tenga, que es el dato más cercano que no es mentira.
    const anteriores = diasSerie.filter((d) => d < dia);
    return anteriores.length ? anteriores[anteriores.length - 1] : diasSerie[0];
  }, [dia, diasSerie]);

  if (!dias.length) return null;

  if (!diasSerie.length) {
    return (
      <NeonContainer
        theme={theme}
        title={title}
        subtitle="Este mes se analizó antes de que existiera el resumen por día"
        icon={<CalendarClock className="h-5 w-5" />}
      >
        <p className="text-sm font-semibold text-slate-400">
          Los {dias.length} cortes del mes están calculados y el resto de la página
          los lee, pero ninguno guarda el bloque global del que salen estas
          tarjetas. Vuelve a ejecutar el análisis del mes para verlas.
        </p>
      </NeonContainer>
    );
  }

  return (
    <NeonContainer
      theme={theme}
      title={title}
      subtitle={subtitle}
      icon={<CalendarClock className="h-5 w-5" />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        {cards.map((card) => (
          <DayMetricCard
            key={card.key}
            label={card.label}
            kind={card.kind}
            dia={diaActivo}
            color={card.color}
            icon={card.icon}
            subValue={card.subValue}
            trendGoodWhen={card.trendGoodWhen}
            reading={leerDia(serie, diasSerie, diaActivo, card.key, card.kind)}
          />
        ))}
      </div>

      {charts.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {charts.map((chart) => (
            <DayTrendChart
              key={chart.title}
              title={chart.title}
              subtitle={chart.subtitle}
              dias={diasSerie}
              selectedDay={diaActivo}
              esTasa={chart.esTasa}
              series={chart.series.map<DayTrendSeries>((s) => ({
                label: s.label,
                color: s.color,
                trendGoodWhen: s.trendGoodWhen,
                values: serieDe(serie, diasSerie, s.key, s.kind),
              }))}
            />
          ))}
        </div>
      )}
    </NeonContainer>
  );
}
