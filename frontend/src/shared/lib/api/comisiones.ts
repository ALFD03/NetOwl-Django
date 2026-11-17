/** Cliente del módulo de Comisiones. */

import { apiClient } from './client';

/** Lo que responden las escrituras del módulo. */
interface Respuesta {
  status: string;
  message: string;
}

export const comisionesApi = {
  /** El detalle venta a venta de un periodo: no viaja en los props por su tamaño. */
  ventas: async <T>(periodo: string) =>
    (await apiClient.get<{ ventas: T[] }>('/api/commissions/sales/', { params: { periodo } })).data.ventas,

  guardarPeriodo: async (body: { periodo: string; inicio_promo: string; inicio?: string; corte_adelantos?: string }) =>
    (await apiClient.post<Respuesta>('/api/commissions/periods/save/', body)).data,

  cerrar: async (periodo: string) =>
    (await apiClient.post<Respuesta>('/api/commissions/periods/close/', { periodo })).data,

  /**
   * Reabre un periodo cerrado. El servidor archiva antes el cierre; exige el
   * motivo y que `confirmacion` sea el periodo escrito a mano.
   */
  reabrir: async (periodo: string, motivo: string, confirmacion: string) =>
    (await apiClient.post<Respuesta>('/api/commissions/periods/reopen/', { periodo, motivo, confirmacion })).data,

  /** La copia completa de un cierre archivado. */
  archivo: async <T>(id: number) =>
    (await apiClient.get<{ copia: T }>(`/api/commissions/archives/${id}/`)).data.copia,

  /**
   * Decide una o varias ventas de una vez. `decision` vacía deshace la
   * decisión y las ventas vuelven a Revisión. `ya_pagada` y `normal` solo
   * en el primer periodo, para los días promocionales del mes anterior.
   */
  guardarRevision: async (body: {
    periodo: string; ordenes: string[]; decision: '' | 'contar' | 'no_contar' | 'ya_pagada' | 'normal'; nota?: string;
  }) => (await apiClient.post<Respuesta>('/api/commissions/reviews/save/', body)).data,

  /** Agrega ventas a mano al periodo: cuentan en él. La nota es obligatoria. */
  agregarManual: async (body: { periodo: string; ordenes: string[]; nota: string }) =>
    (await apiClient.post<Respuesta>('/api/commissions/manual/add/', body)).data,

  quitarManual: async (periodo: string, orden: string) =>
    (await apiClient.post<Respuesta>('/api/commissions/manual/remove/', { periodo, orden })).data,

  /** Solo se manda el campo que cambia; vacío lo borra. */
  guardarIndicador: async (body: {
    periodo: string; persona_id: number; cumplimiento_pct?: number | null; crecimiento_pct?: number | null;
  }) => (await apiClient.post<Respuesta>('/api/commissions/indicators/save/', body)).data,

  /** La tasa oficial del BCV de hoy: una referencia, no la de pago. */
  tasaActual: async () =>
    (await apiClient.get<{ tasa: number; fuente: string }>('/api/commissions/current-rate/')).data,

  /**
   * Borra un informe en borrador con lo decidido en él (revisiones, ventas a
   * mano, indicadores). `confirmacion` es el periodo escrito a mano. El
   * servidor lo rechaza si está cerrado o se cerró alguna vez.
   */
  borrar: async (periodo: string, confirmacion: string) =>
    (await apiClient.post<Respuesta>('/api/commissions/periods/delete/', { periodo, confirmacion })).data,

  guardarCondiciones: async (body: Record<string, unknown>) =>
    (await apiClient.post<Respuesta>('/api/commissions/conditions/save/', body)).data,
};
