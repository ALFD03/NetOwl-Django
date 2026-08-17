import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SupportHeader } from '@/components/Navigation/SupportHeader';
import { DataTable, Column } from '@/components/UI/DataTable';

interface SupportCierre {
  periodo_reporte: string;
  total_tickets: number;
  tickets_resueltos: number;
  pct_resueltos: number;
  pct_cancelados: number;
  pct_rezagados: number;
  tiempo_medio_cierre_horas: number;
  tiempo_mediana_cierre_horas: number;
}

interface Props {
  historico: SupportCierre[];
}

export default function SupportResults({ historico = [] }: Props) {
  const columns: Column<SupportCierre>[] = [
    { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{r.periodo_reporte}</span> },
    { header: 'Creados', accessor: 'total_tickets', align: 'right' },
    { header: '% Resueltos', accessor: (r) => <span className="text-emerald-400 font-semibold">{r.pct_resueltos}%</span>, align: 'right' },
    { header: '% Cancelados', accessor: (r) => <span className="text-rose-400 font-semibold">{r.pct_cancelados}%</span>, align: 'right' },
    { header: '% Rezagados', accessor: (r) => <span className="text-amber-400 font-semibold">{r.pct_rezagados}%</span>, align: 'right' },
    { header: 'MTTR Promedio (h)', accessor: 'tiempo_medio_cierre_horas', align: 'right' },
    { header: 'Mediana (h)', accessor: 'tiempo_mediana_cierre_horas', align: 'right' },
  ];

  return (
    <AppLayout title="Historial de Cierres de Soporte Técnico">
      <SupportHeader activeTab="results" />

      <DataTable
        columns={columns}
        data={historico}
        searchable
        searchPlaceholder="Buscar por periodo..."
      />
    </AppLayout>
  );
}