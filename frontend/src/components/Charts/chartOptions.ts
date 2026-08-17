export const baseLineOptions: any = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top' as const,
      align: 'end' as const,
      labels: { color: '#cbd5e1', font: { size: 11 } },
    },
    datalabels: { display: false },
    tooltip: {
      enabled: true,
      backgroundColor: '#0f1a36',
      titleColor: '#ffffff',
      titleFont: { size: 11, weight: 'bold' as const },
      bodyColor: '#cbd5e1',
      bodyFont: { size: 10 },
      borderColor: '#334155',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4
    },
  },
  scales: {
    x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
  },
};

export const horizontalBarOptions: any = {
  indexAxis: 'x' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top' as const,
      align: 'end' as const,
      labels: {
        color: '#cbd5e1',
        font: { size: 11, weight: '500' },
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 15,
      },
    },
    datalabels: {
      display: true,
      clip: false,
      anchor: 'end' as const,
      align: 'end' as const,
      font: { weight: 'bold' as const, size: 10 },
      formatter: (val: number) => `${val.toLocaleString()}`,
      offset: 4,
      color: "#ffffff"
    },
    tooltip: {
      enabled: true,
      backgroundColor: '#0f1a36',
      titleColor: '#ffffff',
      titleFont: { size: 11, weight: 'bold' as const },
      bodyColor: '#cbd5e1',
      bodyFont: { size: 10 },
      borderColor: '#334155',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4
    },
  },
  scales: {
    x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10, weight: '500' } }, grace: '20%' },
  },
};

export const getHorizontalBarOptions = (customDatalabelsColor?: string, customDatalabelssufijo?: string, customOptions?: any) => ({
  ...horizontalBarOptions,
  ...customOptions,
  plugins: {
    ...horizontalBarOptions.plugins,
    ...customOptions?.plugins,
    datalabels: {
      ...horizontalBarOptions.plugins?.datalabels,
      ...(customDatalabelsColor ? { color: customDatalabelsColor } : {}),
      ...(customDatalabelsColor ? {  formatter: (val: number) => `${val.toLocaleString()}` + `${customDatalabelssufijo}` } : {}),
      ...customOptions?.plugins?.datalabels,
    },
  },
});

export const getDoughnutOptions = (
  centerText: { title: string; value: string | number; color: string }, // Cambiado a string | number
  onHover?: (event: any, elements: any[]) => void
): any => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%', // Un poco más amplio para que el texto respire
  customCenterText: centerText, // El plugin lee esta propiedad
  onHover: onHover || null,
  plugins: {
    legend: {
      display: true,
      position: 'right' as const,
      labels: {
        color: '#cbd5e1',
        font: { size: 10, weight: '500' },
        padding: 12,
        usePointStyle: true,
        pointStyle: 'circle'
      },
    },
    datalabels: {
      display: true,
      color: '#ffffff',
      font: { weight: 'bold' as const, size: 9 },
      formatter: (val: number) => (val >= 3.0 ? `${val.toFixed(1)}%` : ''), // Solo muestra si es > 3% para no amontonar
    },
    tooltip: { enabled: false }, // Desactivamos tooltips porque la info está en el centro
  },
});

export const handleHover = (setter: React.Dispatch<React.SetStateAction<any>>, data: any, suffix = '%') => 
    (event: any, elements: any[]) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        const label = data.labels[idx];
        const match = data._raw.find((r: any) => r.label === label);
        
        const newVal = { 
          name: label, 
          val: match ? `${match.original.toFixed(2)}${suffix}` : 'N/A' 
        };

        // SOLO actualizamos si el nombre cambió para evitar el bucle infinito
        setter((prev: any) => (prev?.name === newVal.name ? prev : newVal));
      } else {
        // SOLO actualizamos a null si no era null antes
        setter((prev: any) => (prev === null ? null : null));
      }
  };