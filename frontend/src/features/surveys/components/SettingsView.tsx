/** Encuestas › Preguntas: las preguntas y opciones de las dos encuestas. */

import { useState } from 'react';
import { Plus } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { getApiErrorMessage, surveysApi } from '@/shared/lib/api';
import { ActionBar, ActionMessage, Button, ConfirmModal, EmptyState, ToggleGroup } from '@/shared/ui';
import type { StatusTone } from '@/shared/ui';

import type { SurveyOption, SurveyQuestion, SurveySettingsProps } from '../types';
import { QuestionCard } from './QuestionCard';
import { QuestionModal } from './QuestionModal';

export function SettingsView({ surveys, kinds, modes }: SurveySettingsProps) {
  const [slug, setSlug] = useState(surveys[0]?.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: StatusTone; text: string } | null>(null);
  // `undefined`: modal cerrado; `null`: pregunta nueva.
  const [editing, setEditing] = useState<SurveyQuestion | null | undefined>(undefined);
  // Lo que espera confirmación para borrarse.
  const [deleting, setDeleting] = useState<
    { kind: 'question'; item: SurveyQuestion } | { kind: 'option'; item: SurveyOption } | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const survey = surveys.find((s) => s.slug === slug) ?? surveys[0];
  const questions = survey?.questions ?? [];

  /** Una escritura; los datos de la página se vuelven a pedir solos al terminar. */
  const write = async (action: () => Promise<{ message: string }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await action();
      setMessage({ type: 'success', text: r.message });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'No se pudo guardar.') });
    } finally {
      setBusy(false);
    }
  };

  const askDelete = (target: NonNullable<typeof deleting>) => {
    setDeleteError(null);
    setDeleting(target);
  };

  /** Borra lo confirmado; si el servidor lo rechaza, el motivo queda en el modal. */
  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const r =
        deleting.kind === 'question'
          ? await surveysApi.deleteQuestion(deleting.item.id)
          : await surveysApi.deleteOption(deleting.item.id);
      setMessage({ type: 'success', text: r.message });
      setDeleting(null);
    } catch (err: unknown) {
      setDeleteError(getApiErrorMessage(err, 'No se pudo eliminar.'));
    } finally {
      setBusy(false);
    }
  };

  const toolbar = (
    <ActionBar
      actions={
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>
          Nueva pregunta
        </Button>
      }
    >
      <ToggleGroup
        activeKey={survey?.slug ?? ''}
        onChange={setSlug}
        options={surveys.map((s) => ({ key: s.slug, label: s.name }))}
      />
    </ActionBar>
  );

  return (
    <AppLayout toolbar={toolbar}>
      <div className="space-y-4">
        <p className="max-w-3xl text-xs text-slate-400">
          Una pregunta u opción que ya se contestó no se borra: se desactiva y deja de ofrecerse, y sigue contando en los
          meses donde se usó. Renombrar una opción cambia su texto también en esos meses.
        </p>
        <ActionMessage status={message} />

        {questions.length === 0 ? (
          <EmptyState
            title="Esta encuesta no tiene preguntas"
            description="Agrega la primera con «Nueva pregunta»."
            size="md"
            bordered
          />
        ) : (
          questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              number={i + 1}
              question={q}
              all={questions}
              isFirst={i === 0}
              isLast={i === questions.length - 1}
              busy={busy}
              onEdit={() => setEditing(q)}
              onDelete={() => askDelete({ kind: 'question', item: q })}
              onMove={(d) => void write(() => surveysApi.moveQuestion(q.id, d))}
              onOptionSave={(body) => write(() => surveysApi.saveOption(body))}
              onOptionDelete={(o) => askDelete({ kind: 'option', item: o })}
              onOptionMove={(o, d) => void write(() => surveysApi.moveOption(o.id, d))}
            />
          ))
        )}
      </div>

      {survey && (
        <QuestionModal
          isOpen={editing !== undefined}
          slug={survey.slug}
          questions={questions}
          question={editing ?? null}
          kinds={kinds}
          modes={modes}
          onClose={() => setEditing(undefined)}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        isLoading={busy}
        error={deleteError}
        message={
          deleting && (
            <p>
              ¿Eliminar {deleting.kind === 'question' ? 'la pregunta' : 'la opción'}{' '}
              <strong className="text-white">«{deleting.item.text}»</strong>
              {deleting.kind === 'question' && ' y sus opciones'}?
            </p>
          )
        }
      />
    </AppLayout>
  );
}
