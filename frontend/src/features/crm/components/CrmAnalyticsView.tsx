import {
  AlertTriangle, Award, CheckCircle2, Clock, Layers, Timer, Trophy, Users, XCircle,
} from 'lucide-react';

import {
  EmptyState,
  EquidistantTimeline,
  MetricCard,
  NeonContainer,
  ProgressBar,
} from '@/shared/ui';
import { formatInteger, formatTwoDecimals, toNumber } from '@/shared/utils/formatters';
import type { CrmDimensionValue, CrmHealthCard, CrmHistoricoRow, CrmRankingEntry } from '../types';
import { CrmAnalyticsCharts } from './analytics/CrmAnalyticsCharts';
import { CrmAnalyticsTable } from './analytics/CrmAnalyticsTable';
import { CrmStageTimeSection } from './analytics/CrmStageTimeSection';

interface CrmAnalyticsViewProps {
  globalData: CrmHistoricoRow;
  rows: CrmDimensionValue[];
  healthCards: CrmHealthCard[];
  rankingCards: CrmRankingEntry[];
  selectedDimension: string;
  selectedPeriod: string;
}

export function CrmAnalyticsView({
  globalData,
  rows,
  healthCards,
  rankingCards,
  selectedDimension,
  selectedPeriod,
}: CrmAnalyticsViewProps) {
  const num = (key: keyof CrmHistoricoRow) => toNumber(globalData[key] as number | undefined);
  const pct = (key: keyof CrmHistoricoRow) => `${formatTwoDecimals(globalData[key] as number | undefined)}%`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total Oportunidades" value={formatInteger(num('total_oportunidades'))} color="slate" subValue="Creadas en el periodo" icon={<Users className="h-4 w-4 text-slate-300" />} />
        <MetricCard label="Tasa Instalados" value={pct('pct_instalacion')} color="green" subValue="Ganados / Creados" icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} />
        <MetricCard label="Tasa Pérdida" value={pct('pct_perdida')} color="red" subValue="Perdidos / Creados" icon={<XCircle className="h-4 w-4 text-rose-400" />} />
        <MetricCard label="Tasa Pendiente" value={pct('pct_pendientes')} color="blue" subValue="Pipeline activo" icon={<Clock className="h-4 w-4 text-sky-400" />} />
        <MetricCard label="Devueltos E8" value={pct('pct_devueltos_e8')} color="yellow" subValue="Entradas a Etapa 8" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EquidistantTimeline
          title="Distribución Tiempo de Instalación"
          icon={<CheckCircle2 className="h-5 w-5" />}
          theme="green"
          min={num('horas_min_inst')}
          p25={num('horas_p25_inst')}
          mediana={num('horas_mediana_inst')}
          promedio={num('horas_promedio_inst')}
          p75={num('horas_p75_inst')}
          max={num('horas_max_inst')}
          std={num('horas_std_inst')}
          pctExcedeProm={num('pct_excede_prom_inst')}
        />
        <EquidistantTimeline
          title="Distribución Tiempo para Pérdida"
          icon={<XCircle className="h-5 w-5" />}
          theme="red"
          min={num('horas_min_perd')}
          p25={num('horas_p25_perd')}
          mediana={num('horas_mediana_perd')}
          promedio={num('horas_promedio_perd')}
          p75={num('horas_p75_perd')}
          max={num('horas_max_perd')}
          std={num('horas_std_perd')}
          pctExcedeProm={num('pct_excede_prom_perd')}
        />
        <div className="lg:col-span-2">
          <EquidistantTimeline
            title="Distribución Tiempo de Cierre"
            subtitle="Instalados + perdidos"
            icon={<Timer className="h-5 w-5" />}
            theme="purple"
            min={num('horas_min_cierre')}
            p25={num('horas_p25_cierre')}
            mediana={num('horas_mediana_cierre')}
            promedio={num('horas_promedio_cierre')}
            p75={num('horas_p75_cierre')}
            max={num('horas_max_cierre')}
            std={num('horas_std_cierre')}
            pctExcedeProm={num('pct_excede_prom_cierre')}
          />
        </div>
      </div>

      <NeonContainer
        theme="green"
        title="Efectividad por Etapa"
        subtitle="Rendimiento del embudo en el periodo · independiente de la dimensión"
        icon={<Layers className="h-5 w-5" />}
      >
        {healthCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {healthCards.map((card) => (
              <MetricCard
                key={card.id}
                label={card.label}
                value={`${formatTwoDecimals(card.pct)}%`}
                caption="Tasa de Conversión"
                color={card.color}
                indicator
              >
                <ProgressBar label={`Exitosos (${formatInteger(card.successCount)})`} percent={card.successPct} valueLabel={`${card.successPct}%`} color="green" />
                <ProgressBar label={`Caídas (${formatInteger(card.failCount)})`} percent={card.failPct} valueLabel={`${card.failPct}%`} color="red" />
              </MetricCard>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No hay datos de efectividad para el periodo seleccionado."
            description="Los periodos analizados antes de esta versión no la tienen guardada; vuelve a ejecutar el análisis del CRM para ese mes."
          />
        )}
      </NeonContainer>

      <CrmStageTimeSection
        globalData={globalData}
        rows={rows}
        selectedDimension={selectedDimension}
      />

      <NeonContainer
        theme="yellow"
        title="Ranking del Periodo"
        subtitle="Quién lidera cada indicador dentro de la dimensión seleccionada"
        icon={<Trophy className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {rankingCards.map((card) => (
            <MetricCard
              key={card.id}
              label={card.label}
              value={card.value}
              subValue={card.caption}
              color={card.color}
              icon={<Award className="h-4 w-4 opacity-80" />}
            >
              <p className="truncate text-sm font-black text-white" title={card.valor}>
                {card.valor}
              </p>
            </MetricCard>
          ))}
        </div>
      </NeonContainer>

      <CrmAnalyticsCharts
        globalData={globalData}
        rows={rows}
        selectedDimension={selectedDimension}
      />

      <CrmAnalyticsTable rows={rows} dimension={selectedDimension} period={selectedPeriod} />
    </div>
  );
}
