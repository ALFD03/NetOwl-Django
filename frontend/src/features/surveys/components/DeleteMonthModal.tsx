/** Borrar un mes de la encuesta con todo lo contestado en él. */

import { useState } from 'react';

import { getApiErrorMessage, surveysApi } from '@/shared/lib/api';
import { ConfirmModal, TextField } from '@/shared/ui';

import { formatMonth } from '../lib/format';
import type { MonthProgress } from '../types';

interface Props {
  isOpen: boolean;
  slug: string;
  name: string;
  progress: MonthProgress | undefined;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteMonthModal({ isOpen, slug, name, progress, onClose, onDeleted }: Props) {
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!progress) return null;
  const { period } = progress;

  /** Al cerrar, la confirmación vuelve a quedar en blanco. */
  const close = () => {
    setConfirmation('');
    setError(null);
    onClose();
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await surveysApi.deletePeriod(slug, period, confirmation.trim());
      onDeleted();
      close();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo borrar el mes.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={close}
      onConfirm={() => void remove()}
      title="Borrar el mes de la encuesta"
      confirmLabel="Borrar el mes"
      isLoading={deleting}
      confirmDisabled={confirmation.trim() !== period}
      error={error}
      message={
        <p>
          Se quita de la {name.toLowerCase()} a los <strong className="text-white">{progress.total} clientes</strong> de{' '}
          <strong className="text-white">{formatMonth(period)}</strong>, con las respuestas de los{' '}
          <strong className="text-white">{progress.completed}</strong> que ya contestaron. Lo contestado solo vive aquí.
          Las preguntas no se tocan y el mes se puede volver a abrir, pero en blanco.
        </p>
      }
    >
      <TextField
        label={`Para confirmar, escribe ${period}`}
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder={period}
        autoComplete="off"
      />
    </ConfirmModal>
  );
}
