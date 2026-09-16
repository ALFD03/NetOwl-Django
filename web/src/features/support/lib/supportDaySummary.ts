/**
 * Qué enseña el bloque del día en Support Analytics.
 *
 * `kind` no es decorativo: dice si restar dos días tiene sentido. Los tickets
 * creados, cerrados y resueltos se acumulan —una fecha de creación o de cierre no
 * se deshace—, así que lo del día es la diferencia con el día anterior. Los
 * rezagados son un nivel —de lo creado hasta esa fecha, cuánto no cerró dentro
 * del mes— y las tasas ya vienen calculadas sobre el acumulado: ni una cosa ni
 * otra se restan (ver `shared/lib/daySeries`).
 *
 * `trendGoodWhen: 'down'` en lo que conviene que baje, para que el color diga si
 * la noticia es buena y no hacia dónde apunta la flecha.
 */

import type { DayCardSpec, DayChartSpec } from '@/shared/ui';

export const SUPPORT_DAY_CARDS: DayCardSpec[] = [
  { key: 'tickets_creados', label: 'Creados', kind: 'flujo', color: 'slate', subValue: 'Entraron ese día' },
  { key: 'tickets_cerrados', label: 'Cerrados', kind: 'flujo', color: 'purple', subValue: 'Resueltos + cancelados' },
  { key: 'tickets_resueltos', label: 'Resueltos', kind: 'flujo', color: 'green', subValue: 'Cerrados con solución' },
  { key: 'tickets_cancelados', label: 'Cancelados', kind: 'flujo', color: 'red', subValue: 'Cerrados sin solución', trendGoodWhen: 'down' },
  { key: 'tickets_rezagados', label: 'Rezagados', kind: 'stock', color: 'yellow', subValue: 'No cerrados dentro del mes', trendGoodWhen: 'down' },
  { key: 'pct_resueltos', label: 'Tasa Resol', kind: 'tasa', color: 'green', subValue: 'Resueltos / cerrados' },
  { key: 'pct_cancelados', label: 'Tasa Cancel', kind: 'tasa', color: 'red', subValue: 'Cancelados / cerrados', trendGoodWhen: 'down' },
];

export const SUPPORT_DAY_CHARTS: DayChartSpec[] = [
  {
    title: 'Entrada y salida por día',
    subtitle: 'Si el equipo despacha al ritmo al que le entra trabajo',
    series: [
      { key: 'tickets_creados', label: 'Creados', kind: 'flujo', color: 'blue' },
      { key: 'tickets_cerrados', label: 'Cerrados', kind: 'flujo', color: 'green' },
    ],
  },
  {
    title: 'Rezago acumulado',
    subtitle: 'De lo creado hasta esa fecha, lo que no cerró dentro del mes',
    series: [{ key: 'tickets_rezagados', label: 'Rezagados', kind: 'stock', color: 'yellow', trendGoodWhen: 'down' }],
  },
  {
    title: 'Tasa de resolución acumulada',
    subtitle: 'Cómo se asienta el mes corte a corte',
    esTasa: true,
    series: [{ key: 'pct_resueltos', label: 'Resolución', kind: 'tasa', color: 'green' }],
  },
];
