/** El botón con el que se descarga cualquier cosa: una forma, cuatro estados. */

import type { ReactNode } from 'react';
import { AlertTriangle, Download, FileX2, Loader2 } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

/** En qué punto está la descarga. */
export type ExportEstado = 'idle' | 'busy' | 'error' | 'empty';

export interface ExportButtonProps {
  onClick: () => void;
  estado?: ExportEstado;
  /** Qué se descarga. En reposo es la etiqueta del botón. */
  label: string;
  /** Qué se dice cuando falló o cuando no había nada. */
  labelError?: string;
  labelEmpty?: string;
  /** El icono en reposo. Los de los otros tres estados los pone el botón. */
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Solo el icono: para las celdas de una tabla, donde no cabe la etiqueta. */
  iconOnly?: boolean;
  /**
   * Sin borde, radio ni sombra propios: el botón va dentro de otra cápsula y
   * los suyos se verían por encima de los de ella.
   */
  seamless?: boolean;
  className?: string;
}

/**
 * La forma que tiene exportar en toda la aplicación.
 *
 * Vivía como `Button variant="secondary"` en cada sitio que descarga algo, y
 * eso lo dejaba idéntico a cualquier otra acción secundaria: el botón que
 * escribe un archivo se parecía al que abre un panel. Aquí tiene una forma
 * propia —la cápsula de la barra de filtros, con el icono en color de marca—
 * y, sobre todo, una sola: tres componentes distintos exportaban con tres
 * aspectos ligeramente distintos porque cada uno reinterpretaba las clases.
 *
 * **El estado es del botón, no del texto de al lado.** Escribir un `.xlsx`
 * tarda lo justo para que no se sepa si se pulsó, y un fallo o un resultado
 * vacío se leían en un banner que hay que buscar con la vista. Aquí el icono y
 * la etiqueta lo dicen en el sitio donde acaba de pulsar el ratón; el banner
 * sigue estando para el motivo, que no cabe en un botón.
 */
export function ExportButton({
  onClick,
  estado = 'idle',
  label,
  labelError = 'No se pudo exportar',
  labelEmpty = 'Nada que exportar',
  icon,
  disabled = false,
  title,
  iconOnly = false,
  seamless = false,
  className,
}: ExportButtonProps) {
  const iconoEstado = {
    busy: <Loader2 className="h-4 w-4 animate-spin text-brand" />,
    error: <AlertTriangle className="h-4 w-4 text-rose-400" />,
    empty: <FileX2 className="h-4 w-4 text-amber-400" />,
    idle: icon ?? <Download className="h-4 w-4 text-brand" />,
  }[estado];

  const etiqueta = { busy: label, error: labelError, empty: labelEmpty, idle: label }[estado];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || estado === 'busy'}
      title={title}
      aria-label={iconOnly ? etiqueta : undefined}
      className={cn(
        'flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-200 transition-all',
        'hover:bg-brand/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
        // La variante de solo icono vive en una celda de tabla: misma forma,
        // más apretada y sin sombra, que en una fila se lee como un relieve
        // fuera de sitio.
        iconOnly ? 'px-2.5 py-2' : 'px-5 py-2.5',
        !seamless && 'border border-slate-700/50 bg-surface-secondary hover:border-brand/40 disabled:hover:border-slate-700/50',
        !seamless && (iconOnly ? 'rounded-xl' : 'rounded-2xl shadow-2xl'),
        className,
      )}
    >
      {iconoEstado}
      {!iconOnly && etiqueta}
    </button>
  );
}
