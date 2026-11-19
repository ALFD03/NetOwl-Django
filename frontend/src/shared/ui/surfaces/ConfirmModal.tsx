/**
 * Confirmación de una acción que no se deshace (borrar, sobre todo).
 *
 * En lugar de `window.confirm`: va con el estilo del kit, enseña el error de la
 * escritura dentro del modal y espera a que termine. `children` lleva lo que
 * haga falta además del mensaje, p. ej. un campo para escribir la confirmación.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

import { ActionMessage } from '../feedback/ActionMessage';
import { Button } from '../primitives/Button';
import { Modal } from './Modal';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  subtitle?: string;
  /** Qué va a pasar, en una o dos frases. */
  message: ReactNode;
  confirmLabel?: string;
  isLoading?: boolean;
  /** Mientras sea `true` no se puede confirmar. */
  confirmDisabled?: boolean;
  /** El error de la última escritura. */
  error?: string | null;
  children?: ReactNode;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmar eliminación',
  subtitle = 'Esta acción no se puede deshacer',
  message,
  confirmLabel = 'Eliminar',
  isLoading = false,
  confirmDisabled = false,
  error,
  children,
}: ConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={<Trash2 className="h-5 w-5 text-rose-400" />}
      theme="red"
      size="sm"
    >
      <div className="space-y-5">
        <div className="text-sm text-slate-300">{message}</div>
        {children}
        <ActionMessage status={error ? { type: 'error', text: error } : null} icon={<AlertTriangle />} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" isLoading={isLoading} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
