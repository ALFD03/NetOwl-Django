import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

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
  /**
   * Buscador encima de las opciones. Por defecto aparece solo cuando la lista
   * es larga (`UMBRAL_BUSQUEDA`): en tres opciones estorba, en cincuenta zonas
   * es la unica forma razonable de encontrar una.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  'aria-label'?: string;
}

/** A partir de cuantas opciones aparece el buscador si no se dice nada. */
const SEARCH_THRESHOLD = 7;

const OPTION_HEIGHT = 40;
const SEARCH_HEIGHT = 52;

/** Minusculas y sin tildes: «guacara» encuentra «Guácara». */
const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * La etiqueta con la parte que coincide resaltada. Si normalizar cambia la
 * longitud (una etiqueta ya descompuesta), se renuncia al resaltado antes que
 * resaltar las letras equivocadas.
 */
function Highlighted({ text, query }: { text: string; query: string }): ReactNode {
  const q = normalize(query.trim());
  const base = normalize(text);
  const start = q ? base.indexOf(q) : -1;
  if (start < 0 || base.length !== text.length) return text;
  return (
    <>
      {text.slice(0, start)}
      <span className="text-amber-300 underline decoration-amber-300/60 underline-offset-2">
        {text.slice(start, start + q.length)}
      </span>
      {text.slice(start + q.length)}
    </>
  );
}

/**
 * Desplegable de una sola seleccion, dibujado en un portal.
 *
 * Sustituye a `<select>` en los sitios donde el menu nativo se comportaba mal:
 * el navegador lo posiciona contra la caja sin transformar, asi que dentro de
 * los contenedores animados de framer-motion salia descolocado, y se cerraba
 * solo en cuanto algo reajustaba el layout. Ver `useAnchoredPanel`.
 *
 * Con listas largas lleva un buscador: se escribe para filtrar (sin distinguir
 * mayusculas ni tildes), las flechas mueven la opcion resaltada y Enter la
 * elige. Con el disparador enfocado, empezar a escribir ya abre la lista
 * buscando. Escape cierra solo la lista, no el modal que la contenga.
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
  searchable,
  searchPlaceholder = 'Escribe para buscar...',
  'aria-label': ariaLabel,
}: Props) {
  const withSearch = searchable ?? options.length >= SEARCH_THRESHOLD;
  const height = Math.min(options.length * OPTION_HEIGHT + 16, 280) + (withSearch ? SEARCH_HEIGHT : 0);
  const { isOpen, coords, triggerRef, panelRef, open, close } =
    useAnchoredPanel<HTMLButtonElement>({ width: panelWidth, estimatedHeight: height });

  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((other) => other.value === value);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!withSearch || !q) return options;
    return options.filter((other) => normalize(other.label).includes(q));
  }, [options, query, withSearch]);

  /** Abre la lista con la consulta dada y la opcion elegida resaltada. */
  const openMenu = (initial = '') => {
    setQuery(initial);
    setHighlightedIndex(initial ? 0 : Math.max(0, options.findIndex((other) => other.value === value)));
    open();
  };

  const closePeriod = (returnFocus = false) => {
    close();
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (option: SelectOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    closePeriod(true);
  };

  /** Mueve la resaltada y la mantiene a la vista dentro de la lista. */
  const move = (index: number) => {
    if (filtered.length === 0) return;
    const next = (index + filtered.length) % filtered.length;
    setHighlightedIndex(next);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      // Sin esto, Enter en el buscador enviaria el formulario que lo contiene.
      e.preventDefault();
      choose(filtered[highlightedIndex]);
    } else if (e.key === 'Escape') {
      // Que no llegue al `window`: ahi escucha el modal para cerrarse entero.
      e.preventDefault();
      e.stopPropagation();
      closePeriod(true);
    } else if (e.key === 'Tab') {
      closePeriod();
    }
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || isOpen) return;
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ';
    if (withSearch && printable) {
      e.preventDefault();
      openMenu(e.key);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      openMenu();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => !disabled && (isOpen ? closePeriod() : openMenu())}
        onKeyDown={onTriggerKey}
        // La maquetacion la pone el componente; `className` solo aporta el
        // aspecto. Asi un disparador que hereda las clases pensadas para un
        // `<input>` no acaba con el texto centrado, que es como los alinea el
        // navegador en un `<button>`.
        className={`flex items-center justify-between gap-2 text-left ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${className}`}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-500'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={panelRef}
          style={{ top: coords.top, left: coords.left, minWidth: coords.width }}
          className="fixed z-[100] flex max-h-[340px] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-surface-secondary shadow-2xl"
        >
          {withSearch && (
            <div className="border-b border-slate-800 p-1.5">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 focus-within:border-brand">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                <input
                  // Abrir la lista es pedir escribir en ella: el foco va al buscador.
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={onListKey}
                  placeholder={searchPlaceholder}
                  aria-label={ariaLabel ? `Buscar en ${ariaLabel}` : 'Buscar'}
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                />
                {query && (
                  <span className="flex-shrink-0 text-[10px] font-bold text-slate-500">
                    {filtered.length}/{options.length}
                  </span>
                )}
              </div>
            </div>
          )}

          <div ref={listRef} role="listbox" className="overflow-y-auto p-1.5 custom-scrollbar">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">
                {options.length === 0 ? 'Sin opciones' : `Sin coincidencias para «${query.trim()}»`}
              </p>
            )}
            {filtered.map((option, index) => {
              const active = option.value === value;
              const checked = withSearch && index === highlightedIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-indice={index}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => choose(option)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${
                    active
                      ? 'bg-brand text-white'
                      : checked
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <span className="truncate">
                    <Highlighted text={option.label} query={withSearch ? query : ''} />
                  </span>
                  {active && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
