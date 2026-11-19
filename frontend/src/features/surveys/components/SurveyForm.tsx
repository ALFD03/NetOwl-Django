/** El formulario de un cliente: su ficha y las preguntas de la encuesta. */

import { useEffect, useMemo, useState } from 'react';
import { Check, PhoneOff, RotateCcw, ThumbsDown } from 'lucide-react';

import { getApiErrorMessage, surveysApi } from '@/shared/lib/api';
import { ActionMessage, Badge, Button, ChoiceChips, LoadingState, Modal, Panel, StatTile, TextArea } from '@/shared/ui';

import { CARD_FIELDS, STATUS_LABEL } from '../lib/format';
import { missing, visible, type Chosen } from '../lib/rules';
import type { Respondent, SurveyQuestion } from '../types';

interface Props {
  respondent: Respondent | null;
  questions: SurveyQuestion[];
  maxText: number;
  /** Sin permiso de atender, el formulario se ve pero no se guarda. */
  canAnswer: boolean;
  onClose: () => void;
}

export function SurveyForm({ respondent, onClose, ...rest }: Props) {
  return (
    <Modal
      isOpen={Boolean(respondent)}
      onClose={onClose}
      title={respondent?.client || respondent?.order || 'Encuesta'}
      subtitle={respondent ? `${respondent.order} · ${STATUS_LABEL[respondent.status]}` : undefined}
      size="lg"
      theme="blue"
    >
      {/* Con `key` cada cliente monta su propio estado: nada de lo elegido pasa al siguiente. */}
      {respondent && <Content key={respondent.id} respondent={respondent} onClose={onClose} {...rest} />}
    </Modal>
  );
}

const keysToNumbers = <T,>(record: Record<string, T>): Record<number, T> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [Number(k), v]));

function Content({ respondent, questions, canAnswer, maxText, onClose }: Omit<Props, 'respondent'> & { respondent: Respondent }) {
  const [chosen, setChosen] = useState<Chosen>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const completed = respondent.status === 'completada';
  // Uno ya completado tiene respuestas que traer; los demás parten en blanco.
  const [loading, setLoading] = useState(completed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { id } = respondent;
  useEffect(() => {
    if (!completed) return undefined;
    let alive = true;
    surveysApi
      .answers(id)
      .then((r) => {
        if (!alive) return;
        setChosen(keysToNumbers(r.options));
        setTexts(keysToNumbers(r.texts));
      })
      .catch((err: unknown) => alive && setError(getApiErrorMessage(err, 'No se pudieron cargar las respuestas.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, completed]);

  const asked = useMemo(() => visible(questions, chosen), [questions, chosen]);
  const unanswered = useMemo(() => missing(questions, chosen, texts), [questions, chosen, texts]);


  const run = async (action: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    // Solo viajan las de las preguntas que se hacen: el servidor descartaría el resto.
    const options = Object.fromEntries(Object.entries(chosen).filter(([k, v]) => asked.has(Number(k)) && v.length > 0));
    const written = Object.fromEntries(Object.entries(texts).filter(([k, v]) => asked.has(Number(k)) && v.trim()));
    void run(() => surveysApi.saveAnswers(id, options, written));
  };

  return (
    <div className="space-y-5">
      <Panel bodyClassName="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {CARD_FIELDS.map(({ key, label }) => (
          <StatTile
            key={key}
            label={label}
            value={<span className="block truncate" title={respondent[key]}>{respondent[key] || '—'}</span>}
            className="min-w-0"
          />
        ))}
      </Panel>

      {respondent.handled_by && (
        <p className="text-xs text-slate-500">
          {STATUS_LABEL[respondent.status]} por <strong className="text-slate-300">{respondent.handled_by}</strong>
          {respondent.handled_at && ` el ${new Date(respondent.handled_at).toLocaleString('es-VE')}`}
        </p>
      )}

      {loading ? (
        <LoadingState message="Cargando respuestas" className="p-8" />
      ) : (
        <div className="space-y-5">
          {questions
            .filter((q) => asked.has(q.id))
            .map((q) => (
              <fieldset key={q.id} disabled={!canAnswer || saving} className="space-y-2">
                <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                  {q.text}
                  {!q.required && <Badge>opcional</Badge>}
                  {q.kind === 'multiple' && <Badge>varias</Badge>}
                </legend>
                {q.kind === 'texto' ? (
                  <TextArea
                    aria-label={q.text}
                    value={texts[q.id] ?? ''}
                    maxLength={maxText}
                    showCount
                    onChange={(e) => setTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Escribe la respuesta del cliente…"
                  />
                ) : (
                  <ChoiceChips
                    aria-label={q.text}
                    options={q.options.map((o) => ({ value: o.id, label: o.text }))}
                    selected={chosen[q.id] ?? []}
                    multiple={q.kind === 'multiple'}
                    disabled={!canAnswer || saving}
                    onChange={(ids) => setChosen((prev) => ({ ...prev, [q.id]: ids }))}
                  />
                )}
              </fieldset>
            ))}
          {questions.length === 0 && <p className="text-sm text-slate-400">Esta encuesta no tiene preguntas activas.</p>}
        </div>
      )}

      <ActionMessage status={error ? { type: 'error', text: error } : null} />

      {canAnswer && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap gap-2">
            {!completed && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<PhoneOff className="h-3.5 w-3.5" />}
                  disabled={saving || respondent.status === 'no_contesta'}
                  onClick={() => void run(() => surveysApi.saveStatus(id, 'no_contesta'))}
                >
                  No contesta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<ThumbsDown className="h-3.5 w-3.5" />}
                  disabled={saving || respondent.status === 'rechazo'}
                  onClick={() => void run(() => surveysApi.saveStatus(id, 'rechazo'))}
                >
                  Rechazó
                </Button>
              </>
            )}
            {respondent.status !== 'pendiente' && (
              <Button
                variant="outline"
                size="sm"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                disabled={saving}
                title={completed ? 'Borra lo contestado y la deja pendiente' : undefined}
                onClick={() => void run(() => surveysApi.saveStatus(id, 'pendiente'))}
              >
                {completed ? 'Reabrir' : 'Volver a pendiente'}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unanswered.length > 0 && <span className="text-xs text-amber-400">Falta responder {unanswered.length}</span>}
            <Button
              icon={<Check className="h-4 w-4" />}
              isLoading={saving}
              disabled={unanswered.length > 0 || loading}
              onClick={save}
            >
              {completed ? 'Actualizar respuestas' : 'Guardar respuestas'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
