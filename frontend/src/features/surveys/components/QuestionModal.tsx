/** Crear o editar una pregunta: su texto, su tipo y de qué otra respuesta depende. */

import { useState } from 'react';

import { getApiErrorMessage, surveysApi } from '@/shared/lib/api';
import { ActionMessage, Button, ChoiceChips, Modal, Panel, SelectMenu, Switch, TextField } from '@/shared/ui';

import type { ConditionMode, QuestionKind, SurveyQuestion, SurveySettingsProps } from '../types';

interface Props {
  isOpen: boolean;
  /** La encuesta a la que pertenece. */
  slug: string;
  /** Las preguntas de la encuesta, de las que esta puede depender. */
  questions: SurveyQuestion[];
  /** La que se edita; `null` crea una nueva. */
  question: SurveyQuestion | null;
  kinds: SurveySettingsProps['kinds'];
  modes: SurveySettingsProps['modes'];
  onClose: () => void;
}

export function QuestionModal(props: Props) {
  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.question ? 'Editar pregunta' : 'Nueva pregunta'}
      size="md"
      theme="blue"
    >
      {/* El modal desmonta su contenido al cerrarse: cada apertura parte de la pregunta que toca. */}
      <Form {...props} />
    </Modal>
  );
}

function Form({ slug, questions, question, kinds, modes, onClose }: Props) {
  const [text, setText] = useState(question?.text ?? '');
  const [kind, setKind] = useState<QuestionKind>(question?.kind ?? 'unica');
  const [required, setRequired] = useState(question?.required ?? true);
  const [active, setActive] = useState(question?.active ?? true);
  const [dependsOn, setDependsOn] = useState(question?.condition_question ? String(question.condition_question) : '');
  const [mode, setMode] = useState<Exclude<ConditionMode, ''>>(
    question?.condition_mode === 'ocultar' ? 'ocultar' : 'mostrar',
  );
  const [options, setOptions] = useState<number[]>(question?.condition_options ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un texto libre no condiciona a nadie: solo se depende de preguntas de opciones.
  const candidates = questions.filter((q) => q.id !== question?.id && q.kind !== 'texto');
  const parent = candidates.find((q) => String(q.id) === dependsOn);
  const hasAnswers = (question?.answers ?? 0) > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await surveysApi.saveQuestion({
        id: question?.id,
        survey: slug,
        text,
        kind,
        required,
        active,
        condition_question: parent ? parent.id : null,
        condition_mode: parent ? mode : '',
        condition_options: parent ? options : [],
      });
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo guardar la pregunta.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <TextField label="Pregunta" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />

      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cómo se responde</span>
        <SelectMenu
          aria-label="Tipo de pregunta"
          value={kind}
          options={kinds.map((k) => ({ value: k.value, label: k.label }))}
          onChange={(v) => setKind(v as QuestionKind)}
        />
        {kind === 'texto' && (
          <p className="text-xs text-slate-500">
            La respuesta se escribe a mano; no lleva opciones y otras preguntas no pueden depender de ella.
          </p>
        )}
        {hasAnswers && kind !== question?.kind && (
          <p className="text-xs text-amber-400">
            Ya tiene respuestas: se conservan tal como se dieron y los resultados las muestran como opción o como texto
            según se contestaron.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <Switch checked={required} onChange={setRequired} label="Obligatoria" />
        <Switch checked={active} onChange={setActive} label="Activa" hint="Si no, deja de preguntarse." />
      </div>

      <Panel
        title="Condición (opcional)"
        description="Sin ella, la pregunta se hace siempre."
        bodyClassName="space-y-2"
      >
        <SelectMenu
          aria-label="Depende de"
          value={dependsOn}
          placeholder="Se hace siempre"
          options={[
            { value: '', label: 'Se hace siempre' },
            ...candidates.map((q) => ({ value: String(q.id), label: q.text })),
          ]}
          onChange={(v) => {
            setDependsOn(v);
            setOptions([]);
          }}
        />
        {parent && (
          <>
            <SelectMenu
              aria-label="Modo de la condición"
              value={mode}
              options={modes.map((m) => ({ value: m.value, label: m.label }))}
              onChange={(v) => setMode(v as Exclude<ConditionMode, ''>)}
            />
            <p className="text-xs text-slate-400">… la respuesta a «{parent.text}» es:</p>
            <ChoiceChips
              aria-label="Respuestas que cumplen la condición"
              multiple
              options={parent.options.map((o) => ({ value: o.id, label: o.text }))}
              selected={options}
              onChange={setOptions}
            />
          </>
        )}
      </Panel>

      <ActionMessage status={error ? { type: 'error', text: error } : null} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          isLoading={saving}
          disabled={!text.trim() || (Boolean(parent) && options.length === 0)}
          onClick={() => void save()}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}
