import React from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { CrmHeader } from '@/components/Navigation/CrmHeader';
import { DataTable, Column } from '@/components/UI/DataTable';
import { formatPeriodoLabel } from '@/utils/formatters';

interface CrmCierre {
  periodo_reporte: string;
  total_oportunidades: number;
  ganados: number;
  perdidos: number;
  pendientes: number;
  pct_instalacion: number;
  pct_perdida: number;
  pct_pendientes: number;
  count_devueltos_e8: number;
  pct_devueltos_e8: number;
  horas_promedio_inst: number;
  horas_mediana_inst: number;
  horas_promedio_perd: number;
}

interface Props {
  historico: CrmCierre[];
}

export default function CrmResults({ historico = [] }: Props) {
  const columns: Column<CrmCierre>[] = [
    { 
      header: 'Periodo', 
      accessor: (r) => <span className="font-bold text-white">{formatPeriodoLabel(r.periodo_reporte)}</span>,
      sortKey: 'periodo_reporte' 
    },
    { header: 'Oportunidades', accessor: 'total_oportunidades', align: 'right', sortKey: 'total_oportunidades' },
    { header: 'Ganados', accessor: (r) => <span className="text-emerald-400 font-semibold">{r.ganados}</span>, align: 'right', sortKey: 'ganados' },
    { header: '% Instalación', accessor: (r) => <span className="text-emerald-400 font-bold">{r.pct_instalacion}%</span>, align: 'right', sortKey: 'pct_instalacion' },
    { header: 'Perdidos', accessor: (r) => <span className="text-rose-400 font-semibold">{r.perdidos}</span>, align: 'right', sortKey: 'perdidos' },
    { header: '% Pérdida', accessor: (r) => <span className="text-rose-400 font-bold">{r.pct_perdida}%</span>, align: 'right', sortKey: 'pct_perdida' },
    { header: 'Pendientes', accessor: (r) => <span className="text-sky-400">{r.pendientes}</span>, align: 'right', sortKey: 'pendientes' },
    { header: '% Devueltos E8', accessor: (r) => <span className="text-amber-400 font-semibold">{r.pct_devueltos_e8}%</span>, align: 'right', sortKey: 'pct_devueltos_e8' },
    { header: 'Lead Time Inst. (h)', accessor: 'horas_promedio_inst', align: 'right', sortKey: 'horas_promedio_inst' },
    { header: 'Tiempo a Pérdida (h)', accessor: 'horas_promedio_perd', align: 'right', sortKey: 'horas_promedio_perd' },
  ];

  return (
    <AppLayout title="Historial de Cierres CRM">
      <CrmHeader activeTab="results" />

      <div className="bg-surface-secondary border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <DataTable
          columns={columns}
          data={historico}
          searchable
          searchPlaceholder="Buscar por periodo..."
        />
      </div>
    </AppLayout>
  );
}