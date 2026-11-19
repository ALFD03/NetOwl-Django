/** La lista del mes y sus resultados; se vuelve a pedir sola tras cualquier escritura. */

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { surveysApi } from '@/shared/lib/api';

import type { Respondent, SurveyResults } from '../types';

export function useRespondents(survey: string, period: string, isEnabled: boolean) {
  return useQuery({
    queryKey: ['surveys', 'respondents', survey, period],
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    queryFn: () => surveysApi.respondents<Respondent, SurveyResults>(survey, period),
  });
}
