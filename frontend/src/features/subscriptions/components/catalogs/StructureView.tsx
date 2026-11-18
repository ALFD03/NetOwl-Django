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
import { NameForm, ZoneForm } from './StructureForms';
import { CatalogBar, ConfirmDelete, CatalogErrorView, actionsColumn, send } from './CatalogCommon';

/**
 * Cómo se reparte la red: cada zona (nodo) con su site, su estado y su unidad
 * de negocio. Los sites y las unidades se administran en Ventas › Estructura de
 * ventas; aquí solo se elige a cuáles pertenece cada zona.
 */
export function StructureView({
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
    actionsColumn<CatalogZone>(c.editZone, (row) =>
      c.setDeleting({ kind: 'zonas', id: row.id, name: row.name })),
  ];

  const stateColumns: Column<CatalogNamed>[] = [
    { header: 'Nombre', accessor: 'name', sortKey: 'name' },
    { header: 'Zonas', accessor: 'zones', align: 'right', sortKey: 'zones' },
    actionsColumn<CatalogNamed>(
      (row) => c.editName('estados', row),
      (row) => c.setDeleting({ kind: 'estados', id: row.id, name: row.name }),
    ),
  ];

  const creations = {
    zonas: { label: 'Nueva zona', onClick: c.newEmptyZone },
    estados: { label: 'Nuevo estado', onClick: () => c.newName('estados') },
  } as Record<string, { label: string; onClick: () => void }>;

  return (
    <AppLayout
      toolbar={
        <CatalogBar
          active={c.view}
          onChange={(key) => c.setView(key as typeof c.view)}
          create={creations[c.view]}
          tabs={[
            { key: 'zonas', label: `Zonas (${zones.length})`, icon: Network },
            { key: 'estados', label: `Estados (${states.length})`, icon: MapPin },
          ]}
        />
      }
    >
      <CatalogErrorView c={c} />

      {c.view === 'zonas' && (
        <NeonContainer title="Zonas" subtitle="Nodos de red, con su site, su estado y su unidad de negocio" icon={<Network className="h-5 w-5" />} theme="blue" noPadding>
          <DataTable columns={zoneColumns} data={zones} searchable searchPlaceholder="Buscar zona..." />
        </NeonContainer>
      )}

      {c.view === 'estados' && (
        <NeonContainer title="Estados" subtitle="Entidades federales. El reporte ETA agrupa por aquí" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={stateColumns} data={states} searchable searchPlaceholder="Buscar estado..." />
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.zoneDraft)}
        onClose={c.closeForms}
        title={c.zoneDraft?.id ? 'Editar zona' : 'Nueva zona'}
        subtitle="Nodo de red: site, estado y unidad de negocio por los que se agrupa"
        icon={<Network className="h-5 w-5 text-sky-400" />}
        theme="blue"
      >
        {c.zoneDraft && (
          <ZoneForm
            value={c.zoneDraft}
            sites={sites}
            states={states}
            coordinators={coordinators}
            technologies={technologies}
            saving={c.saving}
            onChange={(patch) => c.setZoneDraft({ ...c.zoneDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('zonas', { ...c.zoneDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.nameDraft)}
        onClose={c.closeForms}
        title="Estado"
        subtitle="Entidad federal a la que pertenecen las zonas"
        icon={<Gauge className="h-5 w-5 text-emerald-400" />}
        theme="green"
        size="md"
      >
        {c.nameDraft && (
          <NameForm
            value={c.nameDraft}
            saving={c.saving}
            onChange={(patch) => c.setNameDraft({ ...c.nameDraft!, ...patch })}
            onSubmit={(e) =>
              send(e, () => c.save(c.nameDraft!.kind, { id: c.nameDraft!.id, name: c.nameDraft!.name }))
            }
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <ConfirmDelete c={c} />
    </AppLayout>
  );
}
