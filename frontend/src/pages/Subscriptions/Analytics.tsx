/**
 * Página `/subscriptions/analytics/`.
 *
 * Recibe el mes completo de métricas diarias en los props, de modo que mover la
 * barra de días es una reagrupación en cliente y no una vuelta al servidor.
 */

import { AppLayout } from '@/shared/layout/AppLayout';
import { AnalyticsCharts, AnalyticsDimensionTable, AnalyticsFilters, AnalyticsMetrics, CloseProjection } from '@/features/subscriptions/components/analytics';
import { CampaignsExportButton } from '@/features/subscriptions/components/campaigns/CampaignsExportButton';
import {
  useSubscriptionsAnalyticsPage, type SubscriptionsAnalyticsProps,
} from '@/features/subscriptions/hooks/useSubscriptionsAnalyticsPage';
import { DayProgressBar, DaySummary } from '@/shared/ui';

export default function SubscriptionsAnalytics(props: SubscriptionsAnalyticsProps) {
  const a = useSubscriptionsAnalyticsPage(props);

  return (
    <AppLayout
      toolbar={
        <>
          <AnalyticsFilters
            periods={a.periods}
            selectedPeriod={a.selectedPeriod}
            onPeriodChange={a.handlePeriodChange}
            selectedDimension={a.selectedDim}
            onDimensionChange={a.setSelectedDim}
          />
          {a.availableDays.length > 0 && (
            <div className="mb-8">
              <DayProgressBar
                availableDays={a.availableDays}
                monthPeriod={a.monthPeriod}
                daysInMonth={a.totalDays}
                selectedDay={a.effectiveDay}
                onSelect={a.setSelectedDay}
              />
            </div>
          )}
        </>
      }
    >
      <div className="mb-6">
        <CampaignsExportButton rows={a.campaigns} period={a.selectedPeriod} day={a.campaignsDay} />
      </div>

      <DaySummary
        series={a.series}
        days={a.availableDays}
        day={a.effectiveDay}
        cards={a.dayCards}
        charts={a.dayCharts}
      >
        {a.projection && a.installedAtCutoff !== undefined && (
          <CloseProjection
            installs={Number(a.installedAtCutoff)}
            projection={a.projection}
            compliance={a.projectedCompliance}
          />
        )}
      </DaySummary>

      <div className="mt-6">
        <AnalyticsMetrics data={a.globalData} period={a.selectedPeriod} />
      </div>
      <AnalyticsCharts
        globalData={a.globalData}
        currentDimensionData={a.currentDimensionData}
        selectedDimension={a.selectedDim}
      />

      <div className="mt-12">
        <AnalyticsDimensionTable
          rows={a.currentDimensionData}
          dimension={a.selectedDim}
          period={a.selectedPeriod}
        />
      </div>
    </AppLayout>
  );
}
