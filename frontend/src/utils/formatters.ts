export const PALETTE = [
  '#ff2a5f', '#ffb703', '#3b82f6', '#a855f7', '#00ff88',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#64748b'
];

export const formatPeriodoLabel = (str: string): string => {
  if (!str) return '';
  const match = str.match(/(\d{4})-(\d{2})/);
  if (!match) return str;

  const year = match[1];
  const monthNum = parseInt(match[2], 10);
  const monthNames = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];
  const monthName = monthNames[monthNum - 1] || match[2];
  return `${monthName} ${year}`;
};

export const getChurnColor = (val: number): 'green' | 'yellow' | 'red' => {
  if (val < 3.0) return 'green';
  if (val < 4.0) return 'yellow';
  return 'red';
};

export const getCrecimientoColor = (val: number): 'red' | 'yellow' | 'green' => {
  if (val < 0) return 'red';
  if (val < 2.0) return 'yellow';
  return 'green';
};