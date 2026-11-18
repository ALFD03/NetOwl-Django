/**
 * Cómo se leen las horas de los logs de etapa.
 *
 * Una duración de minutos y otra de semanas conviven en la misma tabla, así que
 * hasta dos días se dice en horas y desde ahí en días: «36 h» se lee, «1.512 h»
 * no. El valor exacto en horas va en el `title` de quien lo pinte.
 */

import { CHART_PALETTE } from '@/shared/constants/theme';
import type { FlowTeam, StageKind } from '../types';

export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export const formatExactHours = (hours: number | null | undefined): string =>
  hours === null || hours === undefined ? '' : `${hours.toFixed(2)} horas`;

export const TEAM_LABEL: Record<FlowTeam | 'compartida', string> = {
  atc: 'ATC',
  soporte: 'Soporte',
  compartida: 'Compartida',
};

export const KIND_LABEL: Record<StageKind, string> = {
  cola: 'Cola',
  pausa: 'Pausa',
  gestion: 'Gestión',
  cierre: 'Cierre',
  sin_clasificar: 'Sin clasificar',
};

/** Colores por tipo de etapa, iguales en los dos equipos: la composición del tiempo. */
export const KIND_COLOR: Record<'cola' | 'pausa' | 'gestion' | 'sin_clasificar', string> = {
  cola: CHART_PALETTE[1],
  pausa: CHART_PALETTE[9],
  gestion: CHART_PALETTE[2],
  sin_clasificar: CHART_PALETTE[10],
};
