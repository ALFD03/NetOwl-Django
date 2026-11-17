/**
 * Tipos propios del feature de suscripciones.
 *
 * Los de los props y las respuestas viven en `shared/types/subscriptions` y se
 * reexportan desde aquí, para que el feature siga siendo el único import.
 */

import type { SubscriptionResultDimensionRow } from '@/shared/types/subscriptions';

export * from '@/shared/types/subscriptions';

/**
 * A closed monthly period on the Results page.
 *
 * Carries the same measures as a dimension row, keyed by period instead of by
 * dimension value — hence the derivation rather than a second field list.
 */
export type SubscriptionCierre =
  Omit<SubscriptionResultDimensionRow, 'valor' | 'nuevos'> & {
    periodo_reporte: string;
    nuevos_mes: number;
  };
