/** Utilidades transversales: formateadores, distribuciones y colores de métrica. */

export * from './formatters';



export const getChurnColor = (value: number): 'green' | 'yellow' | 'red' => {
  if (value < 3) return 'green';
  if (value < 4) return 'yellow';
  return 'red';
};

export const getCrecimientoColor = (value: number): 'red' | 'yellow' | 'green' => {
  if (value < 0) return 'red';
  if (value < 2) return 'yellow';
  return 'green';
};
