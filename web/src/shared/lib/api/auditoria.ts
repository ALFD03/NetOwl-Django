/** Cliente del registro de auditoría. */

import { apiClient } from './client';

export const auditoriaApi = {
  /** Un registro con su `detalle`, que no viaja en la lista. */
  detalle: async <T>(id: number) => (await apiClient.get<T>(`/auditoria/api/registro/${id}/`)).data,
};
