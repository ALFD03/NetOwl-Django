/** Cliente del módulo de Encuestas. */

import { apiClient } from './client';

/** Lo que responden las escrituras del módulo. */
interface ApiAnswer {
  status: string;
  message: string;
}

export type MoveDirection = 'up' | 'down';

export interface QuestionBody {
  id?: number;
  survey?: string;
  text: string;
  kind: string;
  required: boolean;
  active: boolean;
  condition_question: number | null;
  condition_mode: string;
  condition_options: number[];
}

export const surveysApi = {
  /** La lista del mes con el estado de cada cliente, y los resultados. */
  respondents: async <R, S>(survey: string, period: string) =>
    (await apiClient.get<{ respondents: R[]; results: S }>('/api/surveys/respondents/', { params: { survey, period } }))
      .data,

  /** Lo que contestó un encuestado: opciones y textos por pregunta. */
  answers: async (id: number) =>
    (
      await apiClient.get<{ options: Record<string, number[]>; texts: Record<string, string> }>('/api/surveys/answers/', {
        params: { id },
      })
    ).data,

  /** Copia la lista de clientes del mes desde Suscripciones (suma a los que faltan). */
  openPeriod: async (survey: string, period: string) =>
    (await apiClient.post<ApiAnswer & { new: number; updated: number; total: number }>('/api/surveys/periods/open/', {
      survey,
      period,
    })).data,

  /** Borra un mes con lo contestado en él. No se deshace; `confirmation` es el mes escrito a mano. */
  deletePeriod: async (survey: string, period: string, confirmation: string) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/periods/delete/', { survey, period, confirmation })).data,

  saveAnswers: async (id: number, options: Record<number, number[]>, texts: Record<number, string>) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/answers/save/', { id, options, texts })).data,

  /** Pendiente, «no contesta» o «rechazó». Volver a pendiente borra lo contestado. */
  saveStatus: async (id: number, status: 'pendiente' | 'no_contesta' | 'rechazo') =>
    (await apiClient.post<ApiAnswer>('/api/surveys/status/save/', { id, status })).data,

  saveQuestion: async (body: QuestionBody) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/questions/save/', body)).data,
  deleteQuestion: async (id: number) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/questions/delete/', { id })).data,
  moveQuestion: async (id: number, direction: MoveDirection) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/questions/move/', { id, direction })).data,

  saveOption: async (body: { id?: number; question?: number; text: string; active: boolean }) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/options/save/', body)).data,
  deleteOption: async (id: number) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/options/delete/', { id })).data,
  moveOption: async (id: number, direction: MoveDirection) =>
    (await apiClient.post<ApiAnswer>('/api/surveys/options/move/', { id, direction })).data,
};
