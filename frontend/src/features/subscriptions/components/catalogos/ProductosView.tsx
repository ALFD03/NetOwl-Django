/** Catálogos › Productos: planes y planes reguladores. */

import { BookMarked, FileSpreadsheet } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DataTable, EmptyState, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  CatalogoPlan,
  CatalogoPlanRegulador,
  CatalogosProductosProps,
} from '@/features/subscriptions/types';
import { PlanForm, PlanReguladorForm } from './CatalogoForms';
import { BarraCatalogo, ConfirmarBorrado, ErrorCatalogo, columnaAcciones, enviar } from './CatalogoComun';

/**
 * El vocabulario de lo que se vende. Es la única clasificación de un producto:
 * de aquí la leen los análisis y el reporte ETA.
 *
 * Lo que está importado y ningún plan reconoce no se lista aquí sino en
 * Notificaciones, que enlaza de vuelta con `?nuevo_plan=`.
 */
export function ProductosView({
  planes, reguladores, tecnologias, tiposPersona, nuevoPlan,
}: CatalogosProductosProps) {
  const c = useCatalogos({ vistaInicial: 'planes', nuevoPlan });

  const columnasPlanes: Column<CatalogoPlan>[] = [
    { header: 'Plan', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Tarifa', accessor: (row) => row.tarifa || '—', sortKey: 'tarifa' },
    { header: 'Tecnología', accessor: 'tecnologia', sortKey: 'tecnologia', filterable: true },
    { header: 'Persona', accessor: 'tipo_persona', sortKey: 'tipo_persona', filterable: true },
    { header: 'Mbps', accessor: 'datas_mbps', align: 'right', sortKey: 'datas_mbps' },
    { header: 'Precio', accessor: 'precio', align: 'right', sortKey: 'precio' },
    // El filtro va por la etiqueta que se ve, no por el booleano: nadie busca
    // «false» en un desplegable que en la tabla pone «—».
    { header: 'TV', accessor: (row) => (row.tiene_tv ? 'Sí' : '—'), filterable: true, filterValue: (row) => (row.tiene_tv ? 'Sí' : 'No') },
    {
      header: 'ETA',
      accessor: (row) => (row.declarar_en_eta ? 'Declara' : 'No declara'),
      filterable: true,
      filterValue: (row) => (row.declarar_en_eta ? 'Declara' : 'No declara'),
    },
    {
      header: 'Plan regulador',
      accessor: (row) => row.plan_regulador || '— sin asignar',
      sortKey: 'plan_regulador',
      filterable: true,
      // Los planes sin asignar son justo lo que hay que encontrar para poder
      // declararlos, así que necesitan su propia opción en el desplegable.
      filterValue: (row) => row.plan_regulador || 'Sin asignar',
    },
    columnaAcciones<CatalogoPlan>(c.editarPlan, (row) =>
      c.setBorrando({ tipo: 'planes', id: row.id, nombre: row.nombre })),
  ];

  const columnasReguladores: Column<CatalogoPlanRegulador>[] = [
    { header: 'Plan declarado', accessor: 'nombre', sortKey: 'nombre' },
    {
      header: 'Hoja',
      accessor: (row) => (row.es_transporte ? 'Transporte' : 'Internet'),
      filterable: true,
      filterValue: (row) => (row.es_transporte ? 'Transporte' : 'Internet'),
    },
    { header: 'Tecnología', accessor: 'tecnologia', sortKey: 'tecnologia', filterable: true },
    { header: 'Persona', accessor: 'tipo_persona', sortKey: 'tipo_persona', filterable: true },
    { header: 'Mbps', accessor: 'datas_mbps', align: 'right', sortKey: 'datas_mbps' },
    { header: 'Precio', accessor: 'precio', align: 'right', sortKey: 'precio' },
    { header: 'TV', accessor: (row) => (row.tiene_tv ? 'Sí' : '—'), filterable: true, filterValue: (row) => (row.tiene_tv ? 'Sí' : 'No') },
    { header: 'Planes', accessor: 'planes', align: 'right', sortKey: 'planes' },
    columnaAcciones<CatalogoPlanRegulador>(c.editarRegulador, (row) =>
      c.setBorrando({ tipo: 'reguladores', id: row.id, nombre: row.nombre })),
  ];

  const altas = {
    planes: { label: 'Nuevo plan', onClick: c.nuevoPlanVacio },
    reguladores: { label: 'Nuevo plan regulador', onClick: c.nuevoRegulador },
  } as Record<string, { label: string; onClick: () => void }>;

  return (
    <AppLayout
      toolbar={
        <BarraCatalogo
          activa={c.vista}
          onChange={(key) => c.setVista(key as typeof c.vista)}
          alta={altas[c.vista]}
          pestanas={[
            { key: 'planes', label: `Planes (${planes.length})`, icon: BookMarked },
            { key: 'reguladores', label: `Planes reguladores (${reguladores.length})`, icon: FileSpreadsheet },
          ]}
        />
      }
    >
      <ErrorCatalogo c={c} />

      {c.vista === 'planes' && (
        <NeonContainer title="Planes" subtitle="Vocabulario comercial: qué productos existen y cómo se clasifican" icon={<BookMarked className="h-5 w-5" />} theme="purple" noPadding>
          <DataTable columns={columnasPlanes} data={planes} searchable searchPlaceholder="Buscar plan..." />
        </NeonContainer>
      )}

      {c.vista === 'reguladores' && (
        <NeonContainer
          title="Planes reguladores"
          subtitle="Una fila por producto declarado: es lo que se exporta en el formulario de la reguladora"
          icon={<FileSpreadsheet className="h-5 w-5" />}
          theme="purple"
          noPadding
        >
          {reguladores.length === 0 ? (
            <EmptyState
              title="Todavía no hay planes reguladores"
              description="Sin ellos el formulario sale vacío: cada plan comercial necesita saber con qué fila se declara."
              icon={<FileSpreadsheet />}
            />
          ) : (
            <DataTable
              columns={columnasReguladores}
              data={reguladores}
              searchable
              searchPlaceholder="Buscar plan declarado..."
            />
          )}
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.planDraft)}
        onClose={c.cerrarFormularios}
        title={c.planDraft?.id ? 'Editar plan del catálogo' : 'Nuevo plan del catálogo'}
        subtitle="Única clasificación del producto: de aquí la leen los análisis y el reporte ETA"
        icon={<BookMarked className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.planDraft && (
          <PlanForm
            value={c.planDraft}
            tecnologias={tecnologias}
            tiposPersona={tiposPersona}
            reguladores={reguladores}
            saving={c.guardando}
            onChange={(patch) => c.setPlanDraft({ ...c.planDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('planes', { ...c.planDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.reguladorDraft)}
        onClose={c.cerrarFormularios}
        title={c.reguladorDraft?.id ? 'Editar plan regulador' : 'Nuevo plan regulador'}
        subtitle="Una fila del formulario de la reguladora: velocidad, renta y tipo de suscriptor declarados"
        icon={<FileSpreadsheet className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.reguladorDraft && (
          <PlanReguladorForm
            value={c.reguladorDraft}
            tecnologias={tecnologias}
            tiposPersona={tiposPersona}
            saving={c.guardando}
            onChange={(patch) => c.setReguladorDraft({ ...c.reguladorDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('reguladores', { ...c.reguladorDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <ConfirmarBorrado c={c} />
    </AppLayout>
  );
}
