import { useCallback, useEffect, useRef, useState } from 'react';

export interface PanelCoords {
  top: number;
  left: number;
  width: number;
}

interface Options {
  /** Ancho fijo del panel. Si se omite, copia el ancho del disparador. */
  width?: number;
  /** Alto estimado, para decidir si el panel cabe debajo o tiene que ir arriba. */
  estimatedHeight?: number;
}

/**
 * Panel flotante anclado a un disparador, dibujado en un portal.
 *
 * Existe porque en esta aplicacion un desplegable no puede posicionarse con
 * `absolute` ni delegarse al navegador:
 *
 * - `absolute` lo recorta el ancestro. La barra de herramientas de AppLayout
 *   es un contenedor con `overflow-y-auto` y las tarjetas usan
 *   `overflow-hidden`; subir el `z-index` no sirve, porque quien recorta es el
 *   contenedor y no el apilamiento.
 * - Un `<select>` nativo delega el menu al navegador, que lo posiciona contra
 *   la caja sin transformar. Dentro de los `motion.div` de framer-motion (el
 *   contenido de la pagina anima `y`, los modales animan `scale`) el menu sale
 *   desplazado, y cualquier reajuste de layout mientras esta abierto lo cierra.
 *
 * El panel se coloca en coordenadas de viewport (`position: fixed`) y sigue al
 * disparador en scroll y resize.
 */
export function useAnchoredPanel<T extends HTMLElement = HTMLDivElement>({
  width,
  estimatedHeight = 320,
}: Options = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<PanelCoords | null>(null);
  // El ref va sobre el elemento que se mide, asi que tiene que tener caja
  // propia: nada de envoltorios con `display: contents`, que no la tienen y
  // devuelven un rectangulo de ceros.
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const MARGEN = 8;

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const r = trigger.getBoundingClientRect();
    // Nunca más ancho que la pantalla: en un teléfono un panel de 360px fijos
    // se salía por la derecha aunque `left` se recortara.
    const ancho = Math.min(width ?? r.width, window.innerWidth - 2 * MARGEN);

    // Si no cabe debajo pero si encima, se abre hacia arriba.
    const cabeDebajo = r.bottom + MARGEN + estimatedHeight <= window.innerHeight;
    const top = cabeDebajo ? r.bottom + MARGEN : Math.max(MARGEN, r.top - MARGEN - estimatedHeight);

    const left = Math.max(MARGEN, Math.min(r.left, window.innerWidth - ancho - MARGEN));

    setCoords({ top, left, width: ancho });
  }, [width, estimatedHeight]);

  const open = useCallback(() => {
    reposition();
    setIsOpen(true);
  }, [reposition]);

  const close = useCallback(() => setIsOpen(false), []);

  const toggle = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      open();
    }
  }, [isOpen, open]);

  useEffect(() => {
    if (!isOpen) return;

    // El panel vive en el portal, asi que no es descendiente del disparador:
    // hay que comprobar los dos antes de dar el clic por "fuera".
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    // `true` en la captura para enterarse tambien del scroll de contenedores
    // internos, que es donde suelen vivir estos controles.
    const seguir = () => reposition();

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', seguir, true);
    window.addEventListener('resize', seguir);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', seguir, true);
      window.removeEventListener('resize', seguir);
    };
  }, [isOpen, reposition]);

  return { isOpen, coords, triggerRef, panelRef, open, close, toggle, reposition };
}
