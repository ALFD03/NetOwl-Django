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
const UMBRAL_BUSQUEDA = 7;

const ALTO_OPCION = 40;
const ALTO_BUSCADOR = 52;

/** Minusculas y sin tildes: «guacara» encuentra «Guácara». */
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * La etiqueta con la parte que coincide resaltada. Si normalizar cambia la
 * longitud (una etiqueta ya descompuesta), se renuncia al resaltado antes que
 * resaltar las letras equivocadas.
 */
function Resaltado({ texto, consulta }: { texto: string; consulta: string }): ReactNode {
  const q = normalizar(consulta.trim());
  const base = normalizar(texto);
  const inicio = q ? base.indexOf(q) : -1;
  if (inicio < 0 || base.length !== texto.length) return texto;
  return (
    <>
      {texto.slice(0, inicio)}
      <span className="text-amber-300 underline decoration-amber-300/60 underline-offset-2">
        {texto.slice(inicio, inicio + q.length)}
      </span>
      {texto.slice(inicio + q.length)}
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
  const conBusqueda = searchable ?? options.length >= UMBRAL_BUSQUEDA;
  const alto = Math.min(options.length * ALTO_OPCION + 16, 280) + (conBusqueda ? ALTO_BUSCADOR : 0);
  const { isOpen, coords, triggerRef, panelRef, open, close } =
    useAnchoredPanel<HTMLButtonElement>({ width: panelWidth, estimatedHeight: alto });

  const [consulta, setConsulta] = useState('');
  const [resaltada, setResaltada] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  const seleccionada = options.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!conBusqueda || !q) return options;
    return options.filter((o) => normalizar(o.label).includes(q));
  }, [options, consulta, conBusqueda]);

  /** Abre la lista con la consulta dada y la opcion elegida resaltada. */
  const abrir = (inicial = '') => {
    setConsulta(inicial);
    setResaltada(inicial ? 0 : Math.max(0, options.findIndex((o) => o.value === value)));
    open();
  };

  const cerrar = (devolverFoco = false) => {
    close();
    if (devolverFoco) triggerRef.current?.focus();
  };

  const elegir = (option: SelectOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    cerrar(true);
  };

  /** Mueve la resaltada y la mantiene a la vista dentro de la lista. */
  const mover = (indice: number) => {
    if (filtradas.length === 0) return;
    const siguiente = (indice + filtradas.length) % filtradas.length;
    setResaltada(siguiente);
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${siguiente}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const teclaEnLista = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mover(resaltada + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mover(resaltada - 1);
    } else if (e.key === 'Enter') {
      // Sin esto, Enter en el buscador enviaria el formulario que lo contiene.
      e.preventDefault();
      elegir(filtradas[resaltada]);
    } else if (e.key === 'Escape') {
      // Que no llegue al `window`: ahi escucha el modal para cerrarse entero.
      e.preventDefault();
      e.stopPropagation();
      cerrar(true);
    } else if (e.key === 'Tab') {
      cerrar();
    }
  };

  const teclaEnDisparador = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || isOpen) return;
    const imprimible = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ';
    if (conBusqueda && imprimible) {
      e.preventDefault();
      abrir(e.key);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      abrir();
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
        onClick={() => !disabled && (isOpen ? cerrar() : abrir())}
        onKeyDown={teclaEnDisparador}
        // La maquetacion la pone el componente; `className` solo aporta el
        // aspecto. Asi un disparador que hereda las clases pensadas para un
        // `<input>` no acaba con el texto centrado, que es como los alinea el
        // navegador en un `<button>`.
        className={`flex items-center justify-between gap-2 text-left ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${className}`}
      >
        <span className={`truncate ${seleccionada ? '' : 'text-slate-500'}`}>
          {seleccionada?.label ?? placeholder}
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
          {conBusqueda && (
            <div className="border-b border-slate-800 p-1.5">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 focus-within:border-brand">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                <input
                  // Abrir la lista es pedir escribir en ella: el foco va al buscador.
                  autoFocus
                  type="text"
                  value={consulta}
                  onChange={(e) => {
                    setConsulta(e.target.value);
                    setResaltada(0);
                  }}
                  onKeyDown={teclaEnLista}
                  placeholder={searchPlaceholder}
                  aria-label={ariaLabel ? `Buscar en ${ariaLabel}` : 'Buscar'}
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                />
                {consulta && (
                  <span className="flex-shrink-0 text-[10px] font-bold text-slate-500">
                    {filtradas.length}/{options.length}
                  </span>
                )}
              </div>
            </div>
          )}

          <div ref={listaRef} role="listbox" className="overflow-y-auto p-1.5 custom-scrollbar">
            {filtradas.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">
                {options.length === 0 ? 'Sin opciones' : `Sin coincidencias para «${consulta.trim()}»`}
              </p>
            )}
            {filtradas.map((option, indice) => {
              const activa = option.value === value;
              const marcada = conBusqueda && indice === resaltada;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={activa}
                  data-indice={indice}
                  onMouseEnter={() => setResaltada(indice)}
                  onClick={() => elegir(option)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${
                    activa
                      ? 'bg-brand text-white'
                      : marcada
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <span className="truncate">
                    <Resaltado texto={option.label} consulta={conBusqueda ? consulta : ''} />
                  </span>
                  {activa && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
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
