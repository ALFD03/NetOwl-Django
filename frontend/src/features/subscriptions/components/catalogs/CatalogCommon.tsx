/**
 * Lo que comparten las cuatro páginas del módulo de Catálogos: la barra de
 * pestañas con su botón de alta, la columna de acciones de cada tabla y la
 * confirmación de borrado.
 */

import type { FormEvent, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Edit3, Plus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ActionMessage, Button, Modal, ToggleGroup, type Column } from '@/shared/ui';
import type { useCatalogs } from '@/features/subscriptions/hooks/useCatalogs';

export type CatalogsState = ReturnType<typeof useCatalogs>;

/** Evita el envío nativo del formulario y ejecuta la acción. */
export const send = (event: FormEvent, action: () => void) => {
  event.preventDefault();
  action();
};

/** La columna con los botones de editar y eliminar de una fila. */
export const actionsColumn = <T,>(onEdit: (row: T) => void, onDelete: (row: T) => void): Column<T> => ({
  header: 'Acciones',
  align: 'right',
  accessor: (row: T) => (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => onEdit(row)}
        className="rounded-lg border border-sky-500/30 p-2 text-sky-400 hover:bg-sky-500/10"
        title="Editar"
      >
        <Edit3 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(row)}
        className="rounded-lg border border-rose-500/30 p-2 text-rose-400 hover:bg-rose-500/10"
        title="Eliminar"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  ),
});

export interface CatalogTab {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface CatalogBarProps {
  tabs: CatalogTab[];
  active: string;
  onChange: (key: string) => void;
  /** El alta de la pestaña activa, si tiene. */
  create?: { label: string; onClick: () => void };
}

/** Las pestañas de la página y, a la derecha, el alta de la que está abierta. */
export function CatalogBar({ tabs, active, onChange, create }: CatalogBarProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
      <ToggleGroup activeKey={active} onChange={onChange} options={tabs} />
      {create && (
        <Button icon={<Plus className="h-4 w-4" />} onClick={create.onClick}>
          {create.label}
        </Button>
      )}
    </div>
  );
}

/**
 * El error de la última escritura: en el modal abierto o, sin modal, sobre el
 * contenido de la página. Con `withNotice`, también la confirmación de la última
 * que salió bien: la usan las páginas donde se registra en serie sin salir de ellas.
 */
export function CatalogErrorView({ c, withNotice = false }: { c: CatalogsState; withNotice?: boolean }) {
  const status = c.error
    ? { type: 'error' as const, text: c.error }
    : withNotice && c.notice
      ? { type: 'success' as const, text: c.notice }
      : null;
  return (
    <ActionMessage
      status={status}
      className="mb-4"
      icon={c.error ? <AlertTriangle /> : <CheckCircle2 />}
    />
  );
}

/** Confirmación de borrado de la fila que el hook tiene marcada. */
export function ConfirmDelete({ c, children }: { c: CatalogsState; children?: ReactNode }) {
  return (
    <Modal
      isOpen={Boolean(c.deleting)}
      onClose={() => c.setDeleting(null)}
      title="Confirmar eliminación"
      subtitle="Esta acción no se puede deshacer"
      icon={<Trash2 className="h-5 w-5 text-rose-400" />}
      theme="red"
      size="sm"
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-300">
          ¿Eliminar <strong className="text-white">{c.deleting?.name}</strong> del catálogo?
        </p>
        {children}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => c.setDeleting(null)}>
            Cancelar
          </Button>
          <Button variant="danger" isLoading={c.saving} onClick={c.confirmDelete}>
            Eliminar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
