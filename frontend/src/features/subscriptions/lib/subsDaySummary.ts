/**
 * Qué enseña el bloque del día en Subscriptions Analytics.
 *
 * `kind` no es decorativo: dice si restar dos días tiene sentido, y aquí hay dos
 * métricas donde la respuesta es **no** aunque lo parezca.
 *
 * - **Bajas es un nivel, no un flujo.** El analizador la define como
 *   `activos_al_inicio − activos_al_corte` (`bajas_idx` en `analyzer.py`): de la
 *   base con la que abrió el mes, cuántos no están activos *ahora mismo*. Si una
 *   orden estaba inactiva el día 7 y volvió el día 8, sale del conjunto y la
 *   cifra **baja**. Restar dos días daría «−2.900 bajas», que no significa nada:
 *   lo que pasó es que 2.900 órdenes volvieron al servicio.
 * - **Reactivaciones también.** `get_reactivations` sólo cuenta las que *siguen
 *   activas al corte*, así que quien reactivó el día 3 y volvió a caerse el 20
 *   deja de contar. Es el total —recuperaciones de pausa incluidas—, el mismo
 *   número que la tarjeta «Reactivaciones» de más abajo en la página.
 *
 * Las altas y los cortes por impago sí se acumulan: una fecha de alta y un corte
 * registrado no se deshacen, así que ahí lo del día es la diferencia.
 *
 * `trendGoodWhen: 'down'` en lo que conviene que baje —bajas, cortes, churn—,
 * para que el color diga si la noticia es buena y no hacia dónde apunta la
 * flecha.
 */

import type { DayCardSpec, DayChartSpec } from '@/shared/ui';

import type { SemaforoObjetivos } from '../types';
import { tonoChurn } from './objetivos';

/**
 * Las tarjetas del día. Una fábrica y no una constante porque el churn se pinta
 * con el semáforo del catálogo.
 */
export const subsDayCards = (semaforo: SemaforoObjetivos): DayCardSpec[] => [
  { key: 'nuevos_mes', label: 'Nuevos', kind: 'flujo', color: 'green', subValue: 'Altas de ese día' },
  {
    key: 'bajas',
    label: 'Bajas',
    kind: 'stock',
    color: 'red',
    subValue: 'De la base inicial, fuera a esa fecha',
    trendGoodWhen: 'down',
  },
  {
    key: 'react_4_P',
    label: 'Reactivaciones',
    kind: 'flujo',
    color: 'blue',
    subValue: 'Reactviaciones de corte impago',
  },
  {
    key: 'react_val',
    label: 'Recuperaciones',
    kind: 'flujo',
    color: 'purple',
    subValue: 'Recuperacion de clientes de meses anteriores',
  },
  {
    key: 'corte_impagado',
    label: 'Corte Impago',
    kind: 'flujo',
    color: 'yellow',
    subValue: 'Cortados ese día',
    trendGoodWhen: 'down',
  },
  { key: 'activos_final', label: 'Base Activa', kind: 'stock', color: 'slate', subValue: 'Activos a esa fecha' },
  {
    key: 'churn_bruto_pct',
    label: 'Churn Bruto',
    kind: 'tasa',
    color: 'red',
    colorFor: (valor) => tonoChurn(valor, semaforo),
    subValue: 'Bajas / base inicial',
    trendGoodWhen: 'down',
  },
];

export const SUBS_DAY_CHARTS: DayChartSpec[] = [
  {
    title: 'Altas por día',
    subtitle: 'Cuántas entraron cada día del mes',
    series: [{ key: 'nuevos_mes', label: 'Altas', kind: 'flujo', color: 'green' }],
  },
  {
    // Las dos como nivel, que es lo único que las hace comparables: altas
    // acumuladas del mes contra la base inicial que a esa fecha no está.
    title: 'Ingresos Reales',
    subtitle: 'Flujo de ingresos o perdida de cliente dia a dia',
    series: [
      { key: 'adiciones_brutas', label: 'Ingresos Reales', kind: 'stock', color: 'purple' },
      // { key: 'bajas', label: 'Bajas a esa fecha', kind: 'stock', color: 'red', trendGoodWhen: 'down' },
    ],
  },
  {
    title: 'Churn bruto',
    subtitle: 'Cómo se asienta el mes corte a corte',
    // esTasa: true,
    series: [
      { key: 'ingresos', label: 'Ingresos', kind: 'stock', color: 'green', trendGoodWhen: 'up' },
      { key: 'bajas', label: 'Perdidas', kind: 'stock', color: 'red', trendGoodWhen: 'down' },
    ],
  },
];
