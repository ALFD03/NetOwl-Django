import { createPortal } from 'react-dom';

import { useTopModalSlot } from '../surfaces/modalSlot';
import { StatusMessage, type StatusMessageProps } from './StatusMessage';

/**
 * El resultado de una acción del usuario (guardar, borrar, registrar…).
 *
 * Con un modal abierto se pinta arriba de ese modal, que es donde se está
 * mirando; si no, en su sitio de la página. Así el error de un formulario no
 * queda escondido detrás del modal que lo provocó.
 */
export function ActionMessage({ className, ...props }: StatusMessageProps) {
  const slot = useTopModalSlot();
  if (!props.status) return null;
  if (slot) return createPortal(<StatusMessage {...props} />, slot);
  return <StatusMessage {...props} className={className} />;
}
