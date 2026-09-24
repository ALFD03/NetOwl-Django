/**
 * Qué enseña el bloque del día en CRM Analytics.
 *
 * `kind` no es decorativo: dice si restar dos días tiene sentido. Las
 * oportunidades creadas, los ganados y los perdidos se acumulan —una fecha de
 * creación o de cierre no se deshace—, así que lo del día es la diferencia con
 * el día anterior. Los pendientes son un nivel —el pipeline vivo a esa fecha, que
 * sube con lo que entra y baja con lo que cierra— y las tasas ya vienen
 * calculadas sobre el acumulado: ni una cosa ni otra se restan (ver
 * `shared/lib/daySeries`).
 *
 * `trendGoodWhen: 'down'` en lo que conviene que baje, para que el color diga si
 * la noticia es buena y no hacia dónde apunta la flecha.
 */

import type { DayCardSpec, DayChartSpec } from '@/shared/ui';

export const CRM_DAY_CARDS: DayCardSpec[] = [
  { key: 'total_oportunidades', label: 'Oportunidades', kind: 'flujo', color: 'slate', subValue: 'Creadas' },
  { key: 'ganados', label: 'Instalados', kind: 'flujo', color: 'green', subValue: 'Cerrados en etapa 7' },
  { key: 'perdidos', label: 'Perdidos', kind: 'flujo', color: 'red', subValue: 'Cerrados como pérdida', trendGoodWhen: 'down' },
  { key: 'pendientes', label: 'Pendientes', kind: 'stock', color: 'blue', subValue: 'Abiertos a esa fecha' },
  { key: 'pct_instalacion', label: 'Tasa Instal', kind: 'tasa', color: 'green', subValue: 'Ganados / creados' },
  { key: 'pct_perdida', label: 'Tasa Perdida', kind: 'tasa', color: 'red', subValue: 'Perdidos / creados', trendGoodWhen: 'down' },
  { key: 'pct_devueltos_e8', label: 'Devueltos E8', kind: 'tasa', color: 'yellow', subValue: 'Riesgo de devolución', trendGoodWhen: 'down' },
];

export const CRM_DAY_CHARTS: DayChartSpec[] = [
  {
    title: 'Oportunidades por día',
    subtitle: 'Cuántas entraron cada día del mes',
    series: [{ key: 'total_oportunidades', label: 'Creadas', kind: 'flujo', color: 'slate' }],
  },
  {
    title: 'Desenlaces por día',
    subtitle: 'Lo que se cerró cada día, a favor y en contra',
    series: [
      { key: 'ganados', label: 'Instalados', kind: 'flujo', color: 'green' },
      { key: 'perdidos', label: 'Perdidos', kind: 'flujo', color: 'red', trendGoodWhen: 'down' },
    ],
  },
  {
    title: 'Tasa de instalación acumulada',
    subtitle: 'Cómo se asienta el mes corte a corte',
    esTasa: true,
    series: [{ key: 'pct_instalacion', label: 'Instalación', kind: 'tasa', color: 'green' }],
  },
];
