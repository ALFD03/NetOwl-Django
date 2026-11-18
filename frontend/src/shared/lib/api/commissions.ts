/** Cliente del módulo de Comisiones. */

import { apiClient } from './client';

/** Lo que responden las escrituras del módulo. */
interface ApiAnswer {
  status: string;
  message: string;
}

export const commissionsApi = {
  /** El detalle venta a venta de un periodo: no viaja en los props por su tamaño. */
  sales: async <T>(period: string) =>
    (await apiClient.get<{ sales: T[] }>('/api/commissions/sales/', { params: { period } })).data.sales,

  savePeriod: async (body: { period: string; promo_start: string; start?: string; advance_cutoff?: string }) =>
    (await apiClient.post<ApiAnswer>('/api/commissions/periods/save/', body)).data,

  closePeriod: async (period: string) =>
    (await apiClient.post<ApiAnswer>('/api/commissions/periods/close/', { period })).data,

  /**
   * Reabre un periodo cerrado. El servidor archiva antes el cierre; exige el
   * motivo y que `confirmation` sea el periodo escrito a mano.
   */
  reopen: async (period: string, reason: string, confirmation: string) =>
    (await apiClient.post<ApiAnswer>('/api/commissions/periods/reopen/', { period, reason, confirmation })).data,

  /** La copia completa de un cierre archivado. */
  archive: async <T>(id: number) =>
    (await apiClient.get<{ snapshot: T }>(`/api/commissions/archives/${id}/`)).data.snapshot,

  /**
   * Decide una o varias ventas de una vez. `decision` vacía deshace la
   * decisión y las ventas vuelven a Revisión. `ya_pagada` y `normal` solo
   * en el primer periodo, para los días promocionales del mes anterior.
   */
  saveReview: async (body: {
    period: string; orders: string[]; decision: '' | 'contar' | 'no_contar' | 'ya_pagada' | 'normal'; note?: string;
  }) => (await apiClient.post<ApiAnswer>('/api/commissions/reviews/save/', body)).data,

  /** Agrega ventas a mano al periodo: cuentan en él. La nota es obligatoria. */
  addManual: async (body: { period: string; orders: string[]; note: string }) =>
    (await apiClient.post<ApiAnswer>('/api/commissions/manual/add/', body)).data,

  removeManual: async (period: string, order: string) =>
    (await apiClient.post<ApiAnswer>('/api/commissions/manual/remove/', { period, order })).data,

  /** Solo se manda el campo que cambia; vacío lo borra. */
  saveIndicator: async (body: {
    period: string; person_id: number; compliance_pct?: number | null; growth_pct?: number | null;
  }) => (await apiClient.post<ApiAnswer>('/api/commissions/indicators/save/', body)).data,

  /** La tasa oficial del BCV de hoy: una referencia, no la de pago. */
  currentRate: async () =>
    (await apiClient.get<{ rate: number; source: string }>('/api/commissions/current-rate/')).data,

  /**
   * Borra un informe en borrador con lo decidido en él (revisiones, ventas a
   * mano, indicadores). `confirmation` es el periodo escrito a mano. El
   * servidor lo rechaza si está cerrado o se cerró alguna vez.
   */
  deleteDraft: async (period: string, confirmation: string) =>
    (await apiClient.post<ApiAnswer>('/api/commissions/periods/delete/', { period, confirmation })).data,

  saveConditions: async (body: Record<string, unknown>) =>
    (await apiClient.post<ApiAnswer>('/api/commissions/conditions/save/', body)).data,
};
