import React, { useState } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { SubHeader } from '@/components/Navigation/SubHeader';
import { DataTable, Column } from '@/components/UI/DataTable';
import { Modal } from '@/components/UI/Modal';

interface CierreResult {
  periodo_reporte: string;
  activos_inicio: number;
  activos_final: number;
  nuevos_mes: number;
  bajas: number;
  churn_neto_pct: number;
  churn_bruto_pct: number;
  reactivaciones: number;
  arpu: number;
  total_billing: number;
}

interface Props {
  periodos: CierreResult[];
}

export default function SubscriptionsResults({ periodos = [] }: Props) {
  const [selectedRow, setSelectedRow] = useState<CierreResult | null>(null);

  const columns: Column<CierreResult>[] = [
    { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{r.periodo_reporte}</span> },
    { header: 'Inicio', accessor: 'activos_inicio', align: 'right' },
    { header: 'Final', accessor: 'activos_final', align: 'right' },
    { header: 'Nuevos', accessor: (r) => <span className="text-emerald-400">+{r.nuevos_mes}</span>, align: 'right' },
    { header: 'Bajas', accessor: (r) => <span className="text-rose-400">-{r.bajas}</span>, align: 'right' },
    { header: 'Churn Neto', accessor: (r) => <span className="font-semibold text-brand">{r.churn_neto_pct}%</span>, align: 'right' },
    { header: 'Churn Bruto', accessor: (r) => <span className="font-semibold text-rose-400">{r.churn_bruto_pct}%</span>, align: 'right' },
    { header: 'Reactivaciones', accessor: 'reactivaciones', align: 'right' },
    { header: 'ARPU', accessor: (r) => <span className="text-amber-400 font-medium">${r.arpu}</span>, align: 'right' },
  ];

  return (
    <AppLayout title="Subscriptions Results">
      <SubHeader activeTab="results" />

      <DataTable
        columns={columns}
        data={periodos}
        searchable
        searchPlaceholder="Buscar por periodo (YYYY-MM)..."
        onRowClick={(row) => setSelectedRow(row)}
      />

      <Modal
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title={`Resumen Completo: ${selectedRow?.periodo_reporte || ''}`}
        size="lg"
      >
        {selectedRow && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-surface-tertiary rounded-lg">
                <p className="text-slate-400">Facturación Total</p>
                <p className="text-base font-bold text-emerald-400 mt-1">${selectedRow.total_billing?.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-surface-tertiary rounded-lg">
                <p className="text-slate-400">ARPU Promedio</p>
                <p className="text-base font-bold text-amber-400 mt-1">${selectedRow.arpu}</p>
              </div>
              <div className="p-3 bg-surface-tertiary rounded-lg">
                <p className="text-slate-400">Reactivaciones</p>
                <p className="text-base font-bold text-blue-400 mt-1">{selectedRow.reactivaciones}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}