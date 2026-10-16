/** Catálogos › Estructura: zonas, sites y estados. */

import { Gauge, MapPin, Network } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DataTable, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type {
  CatalogoNombrado,
  CatalogoSite,
  CatalogoZona,
  CatalogosEstructuraProps,
} from '@/features/subscriptions/types';
import { NombreForm, SiteForm, ZonaForm } from './CatalogoForms';
import { BarraCatalogo, ConfirmarBorrado, ErrorCatalogo, columnaAcciones, enviar } from './CatalogoComun';

/**
 * Cómo se reparte la red: cada zona (nodo) con su site, su estado y su
 * coordinador. Los coordinadores se administran en Ventas; aquí solo se elige
 * el de cada zona.
 */
export function EstructuraView({
  zonas, sites, estados, coordinadores, tecnologias, nuevaZona,
}: CatalogosEstructuraProps) {
  const c = useCatalogos({ vistaInicial: 'zonas', sites, estados, nuevaZona });

  const columnasZonas: Column<CatalogoZona>[] = [
    { header: 'Zona', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Site', accessor: 'site', sortKey: 'site', filterable: true },
    { header: 'Estado', accessor: 'estado', sortKey: 'estado', filterable: true },
    { header: 'Tecnología', accessor: 'tecnologia', sortKey: 'tecnologia', filterable: true },
    {
      header: 'Coordinador',
      accessor: (row) => row.coordinador || '—',
      sortKey: 'coordinador',
      filterable: true,
      filterValue: (row) => row.coordinador || 'Sin coordinador',
    },
    columnaAcciones<CatalogoZona>(c.editarZona, (row) =>
      c.setBorrando({ tipo: 'zonas', id: row.id, nombre: row.nombre })),
  ];

  const columnasSites: Column<CatalogoSite>[] = [
    { header: 'Site', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Orden', accessor: 'orden', align: 'right', sortKey: 'orden' },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    columnaAcciones<CatalogoSite>(c.editarSite, (row) =>
      c.setBorrando({ tipo: 'sites', id: row.id, nombre: row.nombre })),
  ];

  const columnasEstados: Column<CatalogoNombrado>[] = [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    columnaAcciones<CatalogoNombrado>(
      (row) => c.editarNombre('estados', row),
      (row) => c.setBorrando({ tipo: 'estados', id: row.id, nombre: row.nombre }),
    ),
  ];

  const altas = {
    zonas: { label: 'Nueva zona', onClick: c.nuevaZonaVacia },
    sites: { label: 'Nuevo site', onClick: c.nuevoSite },
    estados: { label: 'Nuevo estado', onClick: () => c.nuevoNombre('estados') },
  } as Record<string, { label: string; onClick: () => void }>;

  return (
    <AppLayout
      toolbar={
        <BarraCatalogo
          activa={c.vista}
          onChange={(key) => c.setVista(key as typeof c.vista)}
          alta={altas[c.vista]}
          pestanas={[
            { key: 'zonas', label: `Zonas (${zonas.length})`, icon: Network },
            { key: 'sites', label: `Sites (${sites.length})`, icon: MapPin },
            { key: 'estados', label: `Estados (${estados.length})`, icon: MapPin },
          ]}
        />
      }
    >
      <ErrorCatalogo c={c} />

      {c.vista === 'zonas' && (
        <NeonContainer title="Zonas" subtitle="Nodos de red, con su site, su estado y su coordinador" icon={<Network className="h-5 w-5" />} theme="blue" noPadding>
          <DataTable columns={columnasZonas} data={zonas} searchable searchPlaceholder="Buscar zona..." />
        </NeonContainer>
      )}

      {c.vista === 'sites' && (
        <NeonContainer title="Sites" subtitle="Sedes regionales y el orden en que se presentan en los reportes" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={columnasSites} data={sites} searchable searchPlaceholder="Buscar site..." />
        </NeonContainer>
      )}

      {c.vista === 'estados' && (
        <NeonContainer title="Estados" subtitle="Entidades federales. El reporte ETA agrupa por aquí" icon={<MapPin className="h-5 w-5" />} theme="slate" noPadding>
          <DataTable columns={columnasEstados} data={estados} searchable searchPlaceholder="Buscar estado..." />
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(c.zonaDraft)}
        onClose={c.cerrarFormularios}
        title={c.zonaDraft?.id ? 'Editar zona' : 'Nueva zona'}
        subtitle="Nodo de red: site, estado y coordinador por los que se agrupa"
        icon={<Network className="h-5 w-5 text-sky-400" />}
        theme="blue"
      >
        {c.zonaDraft && (
          <ZonaForm
            value={c.zonaDraft}
            sites={sites}
            estados={estados}
            coordinadores={coordinadores}
            tecnologias={tecnologias}
            saving={c.guardando}
            onChange={(patch) => c.setZonaDraft({ ...c.zonaDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('zonas', { ...c.zonaDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.siteDraft)}
        onClose={c.cerrarFormularios}
        title={c.siteDraft?.id ? 'Editar site' : 'Nuevo site'}
        subtitle="Sede regional y su orden de presentación"
        icon={<MapPin className="h-5 w-5 text-slate-300" />}
        theme="slate"
        size="md"
      >
        {c.siteDraft && (
          <SiteForm
            value={c.siteDraft}
            saving={c.guardando}
            onChange={(patch) => c.setSiteDraft({ ...c.siteDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('sites', { ...c.siteDraft }))}
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
          <NombreForm
            value={c.nombreDraft}
            saving={c.guardando}
            onChange={(patch) => c.setNombreDraft({ ...c.nombreDraft!, ...patch })}
            onSubmit={(e) =>
              enviar(e, () => c.guardar(c.nombreDraft!.tipo, { id: c.nombreDraft!.id, nombre: c.nombreDraft!.nombre }))
            }
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <ConfirmarBorrado c={c} />
    </AppLayout>
  );
}
