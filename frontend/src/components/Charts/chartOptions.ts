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
  },
  scales: {
    x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
    y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '5%' },
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
      anchor: 'end' as const,
      align: 'right' as const,
      font: { weight: 'bold' as const, size: 10 },
      formatter: (val: number) => `${val.toFixed(1)}%`,
      color: '#ffffff',
      offset: 4,
    },
  },
  scales: {
    x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10, weight: '500' } } },
  },
};