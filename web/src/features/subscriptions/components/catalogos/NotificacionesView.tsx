/** Catálogos › Notificaciones: lo pendiente de cada área y lo que se decidió ignorar. */

import type { ReactNode } from 'react';
import { AlertTriangle, BookMarked, EyeOff, Network, Plus, ShieldAlert } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, DataTable, EmptyState, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  AreaCatalogo,
  CatalogoProductoIgnorado,
  CatalogosNotificacionesProps,
  ProductoPendiente,
} from '@/features/subscriptions/types';
import { IgnoradoForm } from './CatalogoForms';
import { BarraCatalogo, ConfirmarBorrado, ErrorCatalogo, columnaAcciones, enviar } from './CatalogoComun';

/** Cómo se presenta la lista de pendientes de cada área. */
const LISTAS: Record<Exclude<AreaCatalogo, 'ventas'>, {
  titulo: string;
  subtitulo: string;
  columna: string;
  icon: ReactNode;
  vacia: string;
  /** A dónde lleva «Registrar», con el nombre ya escrito en el formulario. */
  registrar: { label: string; href: (nombre: string) => string };
}> = {
  productos: {
    titulo: 'Productos por registrar',
    subtitulo: 'Están en los datos importados y ningún plan del catálogo los reconoce. Bloquean importaciones y análisis',
    columna: 'Producto',
    icon: <BookMarked className="h-5 w-5" />,
    vacia: 'Todo lo importado está catalogado: las importaciones y los análisis no tienen nada que reclamar.',
    registrar: { label: 'Crear plan', href: (n) => `/catalogos/productos/?nuevo_plan=${encodeURIComponent(n)}` },
  },
  estructura: {
    titulo: 'Zonas por registrar',
    subtitulo: 'Las traen las suscripciones y no están en el catálogo: sus órdenes quedan sin site, estado ni coordinador',
    columna: 'Zona',
    icon: <Network className="h-5 w-5" />,
    vacia: 'Todas las zonas de las suscripciones están en el catálogo.',
    registrar: { label: 'Crear zona', href: (n) => `/catalogos/estructura/?nueva_zona=${encodeURIComponent(n)}` },
  },
};

/**
 * La bandeja del módulo. «Por registrar» es lo que está en los datos y
 * ninguna fila del catálogo reconoce, área por área; cada nombre se resuelve
 * desde su fila, registrándolo o declarando que nunca lo será. «Ignorados»
 * son esas declaraciones, para poder deshacerlas.
 *
 * Solo aparecen las áreas que el usuario administra: el servidor manda `null`
 * en las demás, que es distinto de una lista vacía ("todo registrado").
 */
export function NotificacionesView({ pendientes, ignorados, areas }: CatalogosNotificacionesProps) {
  const c = useCatalogos({ vistaInicial: 'pendientes' });

  const listas = (Object.keys(LISTAS) as (keyof typeof LISTAS)[])
    .flatMap((area) => {
      const filas = pendientes[area];
      return filas ? [{ area, filas, ...LISTAS[area] }] : [];
    });
  const totalPendientes = listas.reduce((total, lista) => total + lista.filas.length, 0);
  const etiquetaArea = (area: AreaCatalogo) => areas.find((a) => a.value === area)?.label ?? area;

  const columnasPendientes = (
    area: AreaCatalogo,
    columna: string,
    registrar: (typeof LISTAS)[keyof typeof LISTAS]['registrar'],
  ): Column<ProductoPendiente>[] => [
    { header: columna, accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Órdenes', accessor: 'ordenes', align: 'right', sortKey: 'ordenes' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => { window.location.href = registrar.href(row.nombre); }}
          >
            {registrar.label}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<EyeOff className="h-4 w-4" />}
            onClick={() => c.ignorar(area, row.nombre)}
          >
            Ignorar
          </Button>
        </div>
      ),
    },
  ];

  const columnasIgnorados: Column<CatalogoProductoIgnorado>[] = [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    {
      header: 'Lista',
      accessor: (row) => etiquetaArea(row.area),
      sortKey: 'area',
      filterable: true,
      filterValue: (row) => etiquetaArea(row.area),
    },
    { header: 'Nota', accessor: (row) => row.nota || '—' },
    {
      header: 'Registrado por',
      accessor: (row) => row.creado_por || '—',
      filterable: true,
      filterValue: (row) => row.creado_por || 'Sin registrar',
    },
    { header: 'Fecha', accessor: 'creado_en', sortKey: 'creado_en' },
    columnaAcciones<CatalogoProductoIgnorado>(c.editarIgnorado, (row) =>
      c.setBorrando({ tipo: 'ignorados', id: row.id, nombre: row.nombre })),
  ];

  const primeraArea = (areas[0]?.value ?? 'productos') as AreaCatalogo;
  const alta = c.vista === 'ignorados' && areas.length > 0
    ? { label: 'Ignorar un nombre', onClick: () => c.nuevoIgnorado(primeraArea) }
    : undefined;

  return (
    <AppLayout
      toolbar={
        <BarraCatalogo
          activa={c.vista}
          onChange={(key) => c.setVista(key as typeof c.vista)}
          alta={alta}
          pestanas={[
            { key: 'pendientes', label: `Por registrar (${totalPendientes})`, icon: AlertTriangle },
            { key: 'ignorados', label: `Ignorados (${ignorados.length})`, icon: EyeOff },
          ]}
        />
      }
    >
      <ErrorCatalogo c={c} />

      {c.vista === 'pendientes' && (
        <div className="space-y-6">
          {listas.map((lista) => (
            <NeonContainer
              key={lista.area}
              title={`${lista.titulo} (${lista.filas.length})`}
              subtitle={lista.subtitulo}
              icon={lista.icon}
              theme={lista.filas.length ? 'yellow' : 'slate'}
              noPadding
            >
              {lista.filas.length === 0 ? (
                <EmptyState title="Nada pendiente" description={lista.vacia} icon={<ShieldAlert />} />
              ) : (
                <DataTable
                  columns={columnasPendientes(lista.area, lista.columna, lista.registrar)}
                  data={lista.filas}
                  searchable
                  searchPlaceholder={`Buscar ${lista.columna.toLowerCase()}...`}
                />
              )}
            </NeonContainer>
          ))}
          {listas.length === 0 && (
            <EmptyState
              title="Ninguna lista de pendientes"
              description="Las listas de pendientes son de Productos y de Estructura, y no administras ninguno de los dos."
              icon={<ShieldAlert />}
            />
          )}
        </div>
      )}

      {c.vista === 'ignorados' && (
        <NeonContainer
          title="Nombres ignorados"
          subtitle="Lo que se decidió no registrar. Borrar uno lo devuelve a su lista de pendientes"
          icon={<EyeOff className="h-5 w-5" />}
          theme="slate"
          noPadding
        >
          <DataTable columns={columnasIgnorados} data={ignorados} searchable searchPlaceholder="Buscar nombre..." />
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.ignoradoDraft)}
        onClose={c.cerrarFormularios}
        title="Nombre ignorado"
        subtitle="Un nombre de los datos que no se registrará y no debe aparecer como pendiente"
        icon={<EyeOff className="h-5 w-5 text-slate-300" />}
        theme="slate"
        size="md"
      >
        {c.ignoradoDraft && (
          <IgnoradoForm
            value={c.ignoradoDraft}
            areas={areas}
            saving={c.guardando}
            onChange={(patch) => c.setIgnoradoDraft({ ...c.ignoradoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('ignorados', { ...c.ignoradoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <ConfirmarBorrado c={c} />
    </AppLayout>
  );
}
