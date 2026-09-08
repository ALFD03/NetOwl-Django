/**
 * Clases de la "tabla estatica de lectura".
 *
 * `DataTable` cubre el caso interactivo -busqueda, orden, click de fila- y trae
 * su propio marcado. Varias vistas necesitan lo contrario: una tabla que solo
 * muestra, con cabecera pegajosa y separadores propios. Esas montan su `<table>`
 * a mano y repetian la misma cadena de clases; aqui se define una vez.
 *
 * No es un componente a proposito: cada una de esas tablas tiene celdas con
 * formato propio (mono, alineaciones, bordes por columna) que un componente
 * generico solo podria devolver a base de props de escape.
 */
export const READONLY_TABLE = 'w-full text-left text-xs';

/** Cabecera que se queda fija al hacer scroll dentro del contenedor. */
export const READONLY_TABLE_HEAD_STICKY =
  'sticky top-0 border-b border-slate-800 bg-slate-900/80 font-black uppercase text-slate-400 backdrop-blur-sm';

/** Cabecera normal, para tablas que no scrollean. */
export const READONLY_TABLE_HEAD =
  'border-b border-slate-800 bg-slate-900/80 font-black uppercase text-slate-400';

export const READONLY_TABLE_BODY = 'divide-y divide-slate-800/60';
