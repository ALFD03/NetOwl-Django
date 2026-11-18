/** Cliente del registro de auditoría. */

import { apiClient } from './client';

export const auditApi = {
  /** Un registro con su `detalle`, que no viaja en la lista. */
  detalle: async <T>(id: number) => (await apiClient.get<T>(`/api/audit/logs/${id}/`)).data,
};

export interface ServiceCheck {
  ok: boolean;
  ms: number;
  error?: string;
  [datum: string]: unknown;
}

export interface HealthResponse {
  checked_at: string;
  services: Record<'web' | 'postgres' | 'redis' | 'worker' | 'jobs', ServiceCheck>;
}

export interface EndpointStats {
  module: string;
  action: string;
  total: number;
  errors: number;
  denied: number;
  avg_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
  last: string;
}

export interface StatsResponse {
  hours: number;
  by_channel: Record<string, number>;
  by_outcome: Record<string, number>;
  endpoints: EndpointStats[];
  tokens: { token__prefix: string; token__name: string; username: string; total: number; errors: number; last: string }[];
  recent_errors: {
    id: number;
    fecha: string;
    modulo: string;
    accion: string;
    username: string;
    estado_http: number | null;
    descripcion: string;
  }[];
}

/** `/api/audit/`: salud de los servicios y actividad por endpoint. */
export const monitoringApi = {
  health: async () => (await apiClient.get<HealthResponse>('/api/audit/health/')).data,
  stats: async (hours: number) => (await apiClient.get<StatsResponse>('/api/audit/stats/', { params: { hours } })).data,
};
