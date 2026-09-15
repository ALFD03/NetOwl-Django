/**
 * El aviso de productos sin catalogar que devuelve la importación.
 *
 * Ofrece las dos respuestas que el servidor no puede distinguir: registrar el
 * producto como plan o declarar que nunca lo será. Cuando aparece **no se
 * escribió nada**.
 */

import { EyeOff, Plus, ShieldAlert } from 'lucide-react';

import { Button, DataTable, Modal, StatusMessage, type Column } from '@/shared/ui';
import type { ProductoPendiente } from '@/shared/types/subscriptions';
import type { CatalogoBloqueo } from '../lib/catalogo';

export interface CatalogoBloqueoModalProps {
  bloqueo: CatalogoBloqueo | null;
  onClose: () => void;
  /** Marca el producto como "nunca será un plan". */
  onIgnore: (nombre: string) => void;
  /** Producto cuya petición de ignorar está en curso. */
  ignorando: string | null;
  error: string | null;
}

/**
 * Qué hacer con los productos que bloquearon la importación.
 *
 * Se ofrecen las dos respuestas porque la comprobación no puede distinguirlas:
 * un nombre nuevo puede ser un plan que falta por dar de alta o una línea que
 * nunca lo será —un router, una instalación, un servicio puntual—. Quien mira
 * la lista sí lo sabe.
 */
export function CatalogoBloqueoModal({
  bloqueo,
  onClose,
  onIgnore,
  ignorando,
  error,
}: CatalogoBloqueoModalProps) {
  const columnas: Column<ProductoPendiente>[] = [
    { header: 'Producto', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Órdenes', accessor: 'ordenes', align: 'right', sortKey: 'ordenes' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              window.location.href = `/subscriptions/config/?nuevo_plan=${encodeURIComponent(row.nombre)}`;
            }}
          >
            Crear plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<EyeOff className="h-4 w-4" />}
            isLoading={ignorando === row.nombre}
            onClick={() => onIgnore(row.nombre)}
          >
            Ignorar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Modal
      isOpen={Boolean(bloqueo)}
      onClose={onClose}
      title="Productos fuera del catálogo"
      subtitle="No se importó nada: los datos anteriores siguen intactos"
      icon={<ShieldAlert className="h-5 w-5 text-amber-400" />}
      theme="yellow"
      size="wide"
    >
      {bloqueo && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            {bloqueo.productos.length} producto(s) sin registrar afectan a{' '}
            <strong className="text-white">{bloqueo.ordenes}</strong> orden(es). Regístralos
            como plan o márcalos como ignorados y vuelve a cargar el archivo.
          </p>

          <StatusMessage status={error ? { type: 'error', text: error } : null} />

          <DataTable
            columns={columnas}
            data={bloqueo.productos}
            searchable
            searchPlaceholder="Buscar producto..."
          />
        </div>
      )}
    </Modal>
  );
}
