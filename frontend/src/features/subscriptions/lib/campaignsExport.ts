/**
 * El reporte de campañas de suscripciones: una fila por campaña del corte en
 * pantalla, con sus metas y cumplimientos.
 *
 * No hay cálculo nuevo. Cada cifra es la fila `campanna` del análisis, la
 * misma que pinta la tabla de Analytics, y lo único que se compone aquí son las
 * razones que la fila no trae (aporte, ingresos netos, tasa de recuperación) y
 * la meta.
 */

import type { ExcelColumn } from '@/shared/lib/excel';
import type { DimensionVal } from '@/shared/types/domain';
import { toNumber } from '@/shared/utils';
import { periodCompliance, monthOf, type TargetSpec } from './targets';

const INT = '#,##0';
const DEC = '0.00';

export interface CampaignReport {
  campaign: string;
  startBase: number;
  contribution: number;
  installs: number;
  reactivations: number;
  netInflows: number;
  churned: number;
  grossInflows: number;
  churn: number;
  growth: number;
  goal: number;
  salesCompliance: number;
  revenueCompliance: number;
  closeCompliance: number;
  suspensions: number;
  suspensionRate: number;
  recoveries: number;
  recoveryRate: number;
  arpu: number;
  baseFinal: number;
}

const rate = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/**
 * Las filas del reporte, de la campaña que más instala a la que menos.
 *
 * **La meta es la del objetivo general del mes.** Una campaña no es un nivel
 * del catálogo de objetivos —esos son geográficos—, así que se mide igual que
 * los totales de Analytics: su base inicial por el crecimiento general, con
 * las tres metas de `periodCompliance`. Sin recorte a 100, como allí.
 *
 * **El aporte se divide entre la suma de las campañas, no entre el global.**
 * Toda orden cae en alguna (la que no tiene va a `Sin campanna`), así que es la
 * misma cifra, y de este modo el aporte nunca mezcla un corte con otro si el
 * desglose cayó al cierre del mes por faltarle al día.
 */
export function buildCampaignReport(rows: DimensionVal[], target: TargetSpec): CampaignReport[] {
  const totalInstallations = rows.reduce((total, row) => total + toNumber(row.new_subs), 0);

  return rows
    .map((row) => {
      const installs = toNumber(row.new_subs);
      const reactivations = toNumber(row.react_val);
      const suspensions = toNumber(row.unpaid_cuts);
      const recoveries = toNumber(row.react_4_P);
      const compliance = periodCompliance({ ...row, new_in_month: row.new_subs }, target);

      return {
        campaign: row.value,
        startBase: toNumber(row.active_start),
        contribution: rate(installs, totalInstallations),
        installs,
        reactivations,
        netInflows: installs + reactivations,
        churned: toNumber(row.churned),
        grossInflows: toNumber(row.gross_adds),
        churn: toNumber(row.gross_churn_pct),
        growth: toNumber(row.growth),
        goal: compliance.inflowsGoal,
        salesCompliance: compliance.salesCompliance,
        revenueCompliance: compliance.revenueCompliance,
        closeCompliance: compliance.closeCompliance,
        suspensions,
        suspensionRate: toNumber(row.suspension_pct),
        recoveries,
        recoveryRate: rate(recoveries, suspensions),
        arpu: toNumber(row.arpu),
        baseFinal: toNumber(row.active_end),
      };
    })
    .sort((a, b) => b.installs - a.installs || a.campaign.localeCompare(b.campaign));
}

/**
 * Las columnas, en el orden en que el negocio las pidió.
 *
 * Los porcentajes salen como la cifra que se lee (12.5, no 0.125), igual que en
 * el resto de exportaciones; el formato solo decide los decimales.
 */
export const CAMPAIGN_EXCEL_COLUMNS: ExcelColumn<CampaignReport>[] = [
  { header: 'Campaña', value: (r) => r.campaign, width: 30 },
  { header: 'Base Inicio', value: (r) => r.startBase, format: INT },
  { header: 'Aporte %', value: (r) => r.contribution, format: DEC },
  { header: 'Instalaciones', value: (r) => r.installs, format: INT },
  { header: 'Reactivaciones', value: (r) => r.reactivations, format: INT },
  { header: 'Ingresos Netos', value: (r) => r.netInflows, format: INT },
  { header: 'Bajas', value: (r) => r.churned, format: INT },
  { header: 'Ingresos Brutos', value: (r) => r.grossInflows, format: INT },
  { header: 'Churn %', value: (r) => r.churn, format: DEC },
  { header: 'Crecimiento %', value: (r) => r.growth, format: DEC },
  { header: 'Meta', value: (r) => r.goal, format: DEC },
  { header: 'Cumpl. Ventas %', value: (r) => r.salesCompliance, format: DEC },
  { header: 'Cumpl. Ingresos %', value: (r) => r.revenueCompliance, format: DEC },
  { header: 'Cumpl. Cierre %', value: (r) => r.closeCompliance, format: DEC },
  { header: 'Suspensiones', value: (r) => r.suspensions, format: INT },
  { header: 'Tasa Suspensiones %', value: (r) => r.suspensionRate, format: DEC },
  { header: 'Recuperaciones', value: (r) => r.recoveries, format: INT },
  { header: 'Tasa Recuperación %', value: (r) => r.recoveryRate, format: DEC },
  { header: 'ARPU', value: (r) => r.arpu, format: DEC },
  { header: 'Base Final', value: (r) => r.baseFinal, format: INT },
];

/** `Campañas Suscripciones 2026-09 día 15`: qué, de qué mes y de qué corte. */
export const campaignsFileName = (period: string, day: number): string =>
  ['Campañas Suscripciones', monthOf(period), day ? `día ${day}` : ''].join(' ').trim();
