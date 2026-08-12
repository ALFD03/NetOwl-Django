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
      align: 'right' as const,
      font: { weight: 'bold' as const, size: 10 },
      formatter: (val: number) => `${val.toLocaleString()}%`,
      offset: 4,
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

export const getDoughnutOptions = (
  customCenterText: { title: string; value: string; color: string },
  onHoverCallback: (event: any, elements: any[]) => void
): any => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '60%',
  customCenterText,
  onHover: onHoverCallback,
  plugins: {
    legend: {
      display: true,
      position: 'right' as const,
      labels: { color: '#cbd5e1', font: { size: 10, weight: '500' }, padding: 10, usePointStyle: true },
    },
    datalabels: {
      display: true,
      color: '#ffffff',
      font: { weight: 'bold' as const, size: 10 },
      formatter: (val: number) => (val >= 1.0 ? `${val.toFixed(1)}%` : ''),
    },
    tooltip: { enabled: false },
  },
});
