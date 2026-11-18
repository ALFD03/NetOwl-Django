/** Catálogos › Estructura: zonas y estados. Los sites y las unidades de negocio están en Ventas › Estructura de ventas. */

import { Gauge, MapPin, Network } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DataTable, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogs } from '@/features/subscriptions/hooks/useCatalogs';
import type {
  CatalogNamed,
  CatalogZone,
  CatalogsStructureProps,
} from '@/features/subscriptions/types';
import { NameForm, ZoneForm } from './CatalogForms';
import { CatalogBar, ConfirmarBorrado, CatalogErrorView, actionsColumn, enviar } from './CatalogCommon';

/**
 * Cómo se reparte la red: cada zona (nodo) con su site, su estado y su unidad
 * de negocio. Los sites y las unidades se administran en Ventas › Estructura de
 * ventas; aquí solo se elige a cuáles pertenece cada zona.
 */
export function EstructuraView({
  zones, sites, states, coordinators, technologies, newZone,
}: CatalogsStructureProps) {
  const c = useCatalogs({ initialView: 'zonas', sites, states, newZone });

  const zoneColumns: Column<CatalogZone>[] = [
    { header: 'Zona', accessor: 'name', sortKey: 'name' },
    { header: 'Site', accessor: 'site', sortKey: 'site', filterable: true },
    { header: 'Estado', accessor: 'state', sortKey: 'state', filterable: true },
    { header: 'Tecnología', accessor: 'technology', sortKey: 'technology', filterable: true },
    {
      header: 'Unidad de negocio',
      accessor: (row) => row.coordinator || '—',
      sortKey: 'coordinator',
      filterable: true,
      filterValue: (row) => row.coordinator || 'Sin coordinador',
    },
    actionsColumn<CatalogZone>(c.editarZona, (row) =>
      c.setBorrando({ kind: 'zonas', id: row.id, name: row.name })),
  ];

  const stateColumns: Column<CatalogNamed>[] = [
    { header: 'Nombre', accessor: 'name', sortKey: 'name' },
    { header: 'Zonas', accessor: 'zones', align: 'right', sortKey: 'zones' },
    actionsColumn<CatalogNamed>(
      (row) => c.editarNombre('estados', row),
      (row) => c.setBorrando({ kind: 'estados', id: row.id, name: row.name }),
    ),
  ];

  const altas = {
    zonas: { label: 'Nueva zona', onClick: c.nuevaZonaVacia },
    estados: { label: 'Nuevo estado', onClick: () => c.nuevoNombre('estados') },
  } as Record<string, { label: string; onClick: () => void }>;

  return (
    <AppLayout
      toolbar={
        <CatalogBar
          activa={c.vista}
          onChange={(key) => c.setVista(key as typeof c.vista)}
          alta={altas[c.vista]}
          pestanas={[
            { key: 'zonas', label: `Zonas (${zones.length})`, icon: Network },
            { key: 'estados', label: `Estados (${states.length})`, icon: MapPin },
          ]}
        />
      }
    >
      <CatalogErrorView c={c} />

      {c.vista === 'zonas' && (
        <NeonContainer title="Zonas" subtitle="Nodos de red, con su site, su estado y su unidad de negocio" icon={<Network className="h-5 w-5" />} theme="blue" noPadding>
          <DataTable columns={zoneColumns} data={zones} searchable searchPlaceholder="Buscar zona..." />
        </NeonContainer>
      )}

      {c.vista === 'estados' && (
        <NeonContainer title="Estados" subtitle="Entidades federales. El reporte ETA agrupa por aquí" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={stateColumns} data={states} searchable searchPlaceholder="Buscar estado..." />
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.zonaDraft)}
        onClose={c.cerrarFormularios}
        title={c.zonaDraft?.id ? 'Editar zona' : 'Nueva zona'}
        subtitle="Nodo de red: site, estado y unidad de negocio por los que se agrupa"
        icon={<Network className="h-5 w-5 text-sky-400" />}
        theme="blue"
      >
        {c.zonaDraft && (
          <ZoneForm
            value={c.zonaDraft}
            sites={sites}
            states={states}
            coordinators={coordinators}
            technologies={technologies}
            saving={c.guardando}
            onChange={(patch) => c.setZonaDraft({ ...c.zonaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('zonas', { ...c.zonaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.nombreDraft)}
        onClose={c.cerrarFormularios}
        title="Estado"
        subtitle="Entidad federal a la que pertenecen las zonas"
        icon={<Gauge className="h-5 w-5 text-emerald-400" />}
        theme="green"
        size="md"
      >
        {c.nombreDraft && (
          <NameForm
            value={c.nombreDraft}
            saving={c.guardando}
            onChange={(patch) => c.setNombreDraft({ ...c.nombreDraft!, ...patch })}
            onSubmit={(e) =>
              enviar(e, () => c.guardar(c.nombreDraft!.kind, { id: c.nombreDraft!.id, name: c.nombreDraft!.name }))
            }
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <ConfirmarBorrado c={c} />
    </AppLayout>
  );
}
