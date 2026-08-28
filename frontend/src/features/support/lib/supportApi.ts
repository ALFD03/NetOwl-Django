import { apiClient } from '@/shared/lib/api';
import type { SupportBreakdownResponse } from '../types';

export interface SupportBreakdownRequest {
  period: string;
  dimension: string;
  valor: string;
  grupo?: string;
}

/**
 * The tipo / razón / solución breakdown of one dimension value.
 *
 * This cross is deliberately not persisted — the cartesian product of zones,
 * branches and technicians against the ~160 reasons and solutions would be tens
 * of thousands of JSONB rows per period, for something only ever read one cell
 * at a time. The backend recomputes it from the period's tickets
 * on request, with the same metric functions the analyzer uses.
 */
export async function fetchSupportBreakdown(
  request: SupportBreakdownRequest,
): Promise<SupportBreakdownResponse> {
  const { data } = await apiClient.get<SupportBreakdownResponse>(
    '/support/api/breakdown/',
    { params: request },
  );
  return data;
}
