/**
 * Clases de los formularios del módulo.
 *
 * Vivían exportadas desde `EtaView` y repetidas dentro de `Forms.tsx`, así que
 * el formulario las importaba de la vista que lo renderiza y además redeclaraba
 * las suyas. Al aparecer la pantalla de catálogos, con los mismos campos, o se
 * duplicaban por tercera vez o salían de la vista: salen de la vista.
 */

/** Campo dentro de un modal: más compacto, sobre el fondo del modal. */
export const modalInputClass =
  'w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:border-brand outline-none';

export const modalLabelClass = 'text-[10px] font-bold text-slate-400 uppercase';
