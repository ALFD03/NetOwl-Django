import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

import { useAnchoredPanel } from './useAnchoredPanel';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Clases del boton disparador, para que cada sitio conserve su aspecto. */
  className?: string;
  /** Ancho del panel. Por defecto copia el del disparador. */
  panelWidth?: number;
  'aria-label'?: string;
}

/**
 * Desplegable de una sola seleccion, dibujado en un portal.
 *
 * Sustituye a `<select>` en los sitios donde el menu nativo se comportaba mal:
 * el navegador lo posiciona contra la caja sin transformar, asi que dentro de
 * los contenedores animados de framer-motion salia descolocado, y se cerraba
 * solo en cuanto algo reajustaba el layout. Ver `useAnchoredPanel`.
 *
 * Para un formulario que dependa del valor en el submit nativo, sigue haciendo
 * falta un `<input type="hidden">`; aqui todos los consumidores leen el estado
 * de React, asi que no se incluye.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  placeholder = 'Seleccionar...',
  disabled = false,
  className = '',
  panelWidth,
  'aria-label': ariaLabel,
}: Props) {
  const alto = Math.min(options.length * 40 + 16, 280);
  const { isOpen, coords, triggerRef, panelRef, close, toggle } =
    useAnchoredPanel<HTMLButtonElement>({ width: panelWidth, estimatedHeight: alto });

  const seleccionada = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => !disabled && toggle()}
        // La maquetacion la pone el componente; `className` solo aporta el
        // aspecto. Asi un disparador que hereda las clases pensadas para un
        // `<input>` no acaba con el texto centrado, que es como los alinea el
        // navegador en un `<button>`.
        className={`flex items-center justify-between gap-2 text-left ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${className}`}
      >
        <span className={seleccionada ? '' : 'text-slate-500'}>
          {seleccionada?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          style={{ top: coords.top, left: coords.left, minWidth: coords.width }}
          className="fixed z-[100] max-h-[280px] overflow-y-auto rounded-2xl border border-slate-700/80 bg-surface-secondary p-1.5 shadow-2xl custom-scrollbar"
        >
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-500">Sin opciones</p>
          )}
          {options.map((option) => {
            const activa = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={activa}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${
                  activa
                    ? 'bg-brand text-white'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {activa && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
