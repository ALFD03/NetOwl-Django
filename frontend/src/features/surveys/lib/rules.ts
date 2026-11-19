/**
 * Qué preguntas se hacen según lo ya contestado.
 *
 * Espejo de `visible` en `backend/services/surveys/analytics/rules.py`: **los
 * dos tienen que decir lo mismo**, y el servidor es quien manda al guardar.
 */

import type { SurveyQuestion } from '../types';

export type Chosen = Record<number, number[]>;

/** Los ids de las preguntas que se hacen con esas respuestas. */
export function visible(questions: SurveyQuestion[], chosen: Chosen): Set<number> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const memo = new Map<number, boolean>();

  const asked = (id: number, visiting: number[] = []): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const q = byId.get(id)!;
    let result: boolean;
    if (!q.condition_question || !q.condition_mode) {
      result = true;
    } else {
      const parent = q.condition_question;
      const reachable = byId.has(parent) && !visiting.includes(parent) && parent !== id;
      const given = reachable && asked(parent, [...visiting, id]) ? (chosen[parent] ?? []) : [];
      const matches = given.some((o) => q.condition_options.includes(o));
      result = q.condition_mode === 'mostrar' ? matches : !matches;
    }
    memo.set(id, result);
    return result;
  };

  return new Set(questions.filter((q) => asked(q.id)).map((q) => q.id));
}

/** Las obligatorias que se hacen y siguen sin respuesta (opción o texto). */
export function missing(questions: SurveyQuestion[], chosen: Chosen, texts: Record<number, string>): SurveyQuestion[] {
  const asked = visible(questions, chosen);
  return questions.filter((q) => {
    if (!asked.has(q.id) || !q.required) return false;
    return q.kind === 'texto' ? !(texts[q.id] ?? '').trim() : (chosen[q.id]?.length ?? 0) === 0;
  });
}
