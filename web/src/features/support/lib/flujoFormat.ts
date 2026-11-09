/**
 * Cómo se leen las horas de los logs de etapa.
 *
 * Una duración de minutos y otra de semanas conviven en la misma tabla, así que
 * hasta dos días se dice en horas y desde ahí en días: «36 h» se lee, «1.512 h»
 * no. El valor exacto en horas va en el `title` de quien lo pinte.
 */

import { CHART_PALETTE } from '@/shared/constants/theme';
import type { EquipoFlujo, TipoEtapa } from '../types';

export function formatDuracion(horas: number | null | undefined): string {
  if (horas === null || horas === undefined || Number.isNaN(horas)) return '—';
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} d`;
}

export const formatHorasExactas = (horas: number | null | undefined): string =>
  horas === null || horas === undefined ? '' : `${horas.toFixed(2)} horas`;

export const ETIQUETA_EQUIPO: Record<EquipoFlujo | 'compartida', string> = {
  atc: 'ATC',
  soporte: 'Soporte',
  compartida: 'Compartida',
};

export const ETIQUETA_TIPO: Record<TipoEtapa, string> = {
  cola: 'Cola',
  pausa: 'Pausa',
  gestion: 'Gestión',
  cierre: 'Cierre',
  sin_clasificar: 'Sin clasificar',
};

/** Colores por tipo de etapa, iguales en los dos equipos: la composición del tiempo. */
export const COLOR_TIPO: Record<'cola' | 'pausa' | 'gestion' | 'sin_clasificar', string> = {
  cola: CHART_PALETTE[1],
  pausa: CHART_PALETTE[9],
  gestion: CHART_PALETTE[2],
  sin_clasificar: CHART_PALETTE[10],
};
