/** Tipos de Encuestas: lo que el servidor manda a sus páginas. */

export type QuestionKind = 'unica' | 'multiple' | 'texto';
export type ConditionMode = 'mostrar' | 'ocultar' | '';
export type RespondentStatus = 'pendiente' | 'completada' | 'no_contesta' | 'rechazo';

export interface SurveyOption {
  id: number;
  text: string;
  active: boolean;
  position: number;
  /** Cuántas veces se eligió. Solo en la configuración. */
  answers: number | null;
}

export interface SurveyQuestion {
  id: number;
  text: string;
  kind: QuestionKind;
  required: boolean;
  active: boolean;
  position: number;
  condition_question: number | null;
  condition_mode: ConditionMode;
  condition_options: number[];
  /** Cuántas respuestas tiene. Solo en la configuración. */
  answers: number | null;
  options: SurveyOption[];
}

interface StatusCounts {
  total: number;
  completed: number;
  no_answer: number;
  refused: number;
  pending: number;
}

/** Cómo va un mes: cuántos clientes hay y en qué estado. */
export interface MonthProgress extends StatusCounts {
  period: string;
  open: boolean;
}

export interface Respondent {
  id: number;
  order: string;
  client: string;
  ci: string;
  seller: string;
  channel: string;
  branch: string;
  zone: string;
  service_type: string;
  campaign: string;
  phone1: string;
  phone2: string;
  status: RespondentStatus;
  handled_by: string | null;
  handled_at: string | null;
}

export interface OptionResult {
  id: number;
  text: string;
  n: number;
  pct: number | null;
}

export interface QuestionResult {
  id: number;
  text: string;
  kind: QuestionKind;
  active: boolean;
  answered: number;
  options: OptionResult[];
  /** Las primeras respuestas escritas; `texts_total` es cuántas hay. */
  texts: string[];
  texts_total: number;
}

export interface SurveyResults extends StatusCounts {
  questions: QuestionResult[];
}

export interface SurveyPageProps {
  slug: string;
  name: string;
  period: string;
  periods: MonthProgress[];
  questions: SurveyQuestion[];
  max_text: number;
  can_answer: boolean;
  can_manage: boolean;
  can_delete: boolean;
}

export interface SurveyConfig {
  slug: string;
  name: string;
  questions: SurveyQuestion[];
}

export interface SurveySettingsProps {
  surveys: SurveyConfig[];
  kinds: { value: QuestionKind; label: string }[];
  modes: { value: Exclude<ConditionMode, ''>; label: string }[];
  max_text: number;
}
