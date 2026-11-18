/** Catálogos › Productos: planes y planes reguladores. */

import { BookMarked, FileSpreadsheet } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DataTable, EmptyState, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogs } from '@/features/subscriptions/hooks/useCatalogs';
import type {
  CatalogPlan,
  CatalogRegulatoryPlan,
  CatalogsProductsProps,
} from '@/features/subscriptions/types';
import { PlanForm, RegulatoryPlanForm } from './ProductForms';
import { CatalogBar, ConfirmDelete, CatalogErrorView, actionsColumn, send } from './CatalogCommon';

/**
 * El vocabulario de lo que se vende. Es la única clasificación de un producto:
 * de aquí la leen los análisis y el reporte ETA.
 *
 * Lo que está importado y ningún plan reconoce no se lista aquí sino en
 * Notificaciones, que enlaza de vuelta con `?new_plan=`.
 */
export function ProductsView({
  plans, regulators, technologies, personTypes, newPlan,
}: CatalogsProductsProps) {
  const c = useCatalogs({ initialView: 'planes', newPlan });

  const planColumns: Column<CatalogPlan>[] = [
    { header: 'Plan', accessor: 'name', sortKey: 'name' },
    { header: 'Tarifa', accessor: (row) => row.tariff || '—', sortKey: 'tariff' },
    { header: 'Tecnología', accessor: 'technology', sortKey: 'technology', filterable: true },
    { header: 'Persona', accessor: 'person_type', sortKey: 'person_type', filterable: true },
    { header: 'Mbps', accessor: 'data_mbps', align: 'right', sortKey: 'data_mbps' },
    { header: 'Precio', accessor: 'price', align: 'right', sortKey: 'price' },
    // El filtro va por la etiqueta que se ve, no por el booleano: nadie busca
    // «false» en un desplegable que en la tabla pone «—».
    { header: 'TV', accessor: (row) => (row.has_tv ? 'Sí' : '—'), filterable: true, filterValue: (row) => (row.has_tv ? 'Sí' : 'No') },
    {
      header: 'ETA',
      accessor: (row) => (row.declare_in_eta ? 'Declara' : 'No declara'),
      filterable: true,
      filterValue: (row) => (row.declare_in_eta ? 'Declara' : 'No declara'),
    },
    {
      header: 'Plan regulador',
      accessor: (row) => row.regulator_plan || '— sin asignar',
      sortKey: 'regulator_plan',
      filterable: true,
      // Los planes sin asignar son justo lo que hay que encontrar para poder
      // declararlos, así que necesitan su propia opción en el desplegable.
      filterValue: (row) => row.regulator_plan || 'Sin asignar',
    },
    actionsColumn<CatalogPlan>(c.editPlan, (row) =>
      c.setDeleting({ kind: 'planes', id: row.id, name: row.name })),
  ];

  const regulatoryColumns: Column<CatalogRegulatoryPlan>[] = [
    { header: 'Plan declarado', accessor: 'name', sortKey: 'name' },
    {
      header: 'Hoja',
      accessor: (row) => (row.is_transport ? 'Transporte' : 'Internet'),
      filterable: true,
      filterValue: (row) => (row.is_transport ? 'Transporte' : 'Internet'),
    },
    { header: 'Tecnología', accessor: 'technology', sortKey: 'technology', filterable: true },
    { header: 'Persona', accessor: 'person_type', sortKey: 'person_type', filterable: true },
    { header: 'Mbps', accessor: 'data_mbps', align: 'right', sortKey: 'data_mbps' },
    { header: 'Precio', accessor: 'price', align: 'right', sortKey: 'price' },
    { header: 'TV', accessor: (row) => (row.has_tv ? 'Sí' : '—'), filterable: true, filterValue: (row) => (row.has_tv ? 'Sí' : 'No') },
    { header: 'Planes', accessor: 'plans', align: 'right', sortKey: 'plans' },
    actionsColumn<CatalogRegulatoryPlan>(c.editRegulator, (row) =>
      c.setDeleting({ kind: 'reguladores', id: row.id, name: row.name })),
  ];

  const creations = {
    planes: { label: 'Nuevo plan', onClick: c.newEmptyPlan },
    reguladores: { label: 'Nuevo plan regulador', onClick: c.newRegulator },
  } as Record<string, { label: string; onClick: () => void }>;

  return (
    <AppLayout
      toolbar={
        <CatalogBar
          active={c.view}
          onChange={(key) => c.setView(key as typeof c.view)}
          create={creations[c.view]}
          tabs={[
            { key: 'planes', label: `Planes (${plans.length})`, icon: BookMarked },
            { key: 'reguladores', label: `Planes reguladores (${regulators.length})`, icon: FileSpreadsheet },
          ]}
        />
      }
    >
      <CatalogErrorView c={c} />

      {c.view === 'planes' && (
        <NeonContainer title="Planes" subtitle="Vocabulario comercial: qué productos existen y cómo se clasifican" icon={<BookMarked className="h-5 w-5" />} theme="purple" noPadding>
          <DataTable columns={planColumns} data={plans} searchable searchPlaceholder="Buscar plan..." />
        </NeonContainer>
      )}

      {c.view === 'reguladores' && (
        <NeonContainer
          title="Planes reguladores"
          subtitle="Una fila por producto declarado: es lo que se exporta en el formulario de la reguladora"
          icon={<FileSpreadsheet className="h-5 w-5" />}
          theme="purple"
          noPadding
        >
          {regulators.length === 0 ? (
            <EmptyState
              title="Todavía no hay planes reguladores"
              description="Sin ellos el formulario sale vacío: cada plan comercial necesita saber con qué fila se declara."
              icon={<FileSpreadsheet />}
            />
          ) : (
            <DataTable
              columns={regulatoryColumns}
              data={regulators}
              searchable
              searchPlaceholder="Buscar plan declarado..."
            />
          )}
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.planDraft)}
        onClose={c.closeForms}
        title={c.planDraft?.id ? 'Editar plan del catálogo' : 'Nuevo plan del catálogo'}
        subtitle="Única clasificación del producto: de aquí la leen los análisis y el reporte ETA"
        icon={<BookMarked className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.planDraft && (
          <PlanForm
            value={c.planDraft}
            technologies={technologies}
            personTypes={personTypes}
            regulators={regulators}
            saving={c.saving}
            onChange={(patch) => c.setPlanDraft({ ...c.planDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('planes', { ...c.planDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.regulatorDraft)}
        onClose={c.closeForms}
        title={c.regulatorDraft?.id ? 'Editar plan regulador' : 'Nuevo plan regulador'}
        subtitle="Una fila del formulario de la reguladora: velocidad, renta y tipo de suscriptor declarados"
        icon={<FileSpreadsheet className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.regulatorDraft && (
          <RegulatoryPlanForm
            value={c.regulatorDraft}
            technologies={technologies}
            personTypes={personTypes}
            saving={c.saving}
            onChange={(patch) => c.setRegulatorDraft({ ...c.regulatorDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('reguladores', { ...c.regulatorDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <ConfirmDelete c={c} />
    </AppLayout>
  );
}
