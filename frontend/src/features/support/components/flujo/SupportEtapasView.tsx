/**
 * El catálogo de etapas: de qué equipo es cada etapa y qué se hace en ella.
 *
 * Los logs solo dicen «de A pasó a B». Repartir el tiempo de un ticket entre ATC
 * y Soporte —y dentro de cada uno entre cola, pausa y gestión— necesita saber
 * qué es cada etapa, y el nombre no basta. La primera pestaña es la diferencia:
 * etapas que ya aparecen en los logs y que nadie ha clasificado.
 */

import { useState, type FormEvent } from 'react';
import { router } from '@inertiajs/react';
import {
  AlertTriangle,
  Edit3,
  GitBranch,
  Info,
  ListChecks,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { supportApi } from '@/shared/lib/api/support';
import {
  Button,
  DataTable,
  EmptyState,
  Modal,
  NeonContainer,
  SelectMenu,
  StatusMessage,
  TextField,
  ToggleGroup,
  type Column,
} from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';
import { ETIQUETA_EQUIPO, ETIQUETA_TIPO } from '../../lib/flujoFormat';
import type { EtapaPendiente, EtapaSoporte, SupportEtapasProps } from '../../types';

type Vista = 'pendientes' | 'catalogo';
type Borrador = { id?: number; nombre: string; equipo: string; tipo: string };

export function SupportEtapasView({
  etapas,
  pendientes,
  equipos,
  tipos,
  etapaEscalamiento,
  etapasCierre,
  nuevaEtapa,
}: SupportEtapasProps) {
  const vacio = (nombre = ''): Borrador => ({
    nombre,
    equipo: equipos[0]?.value ?? 'atc',
    tipo: tipos[0]?.value ?? 'cola',
  });

  const [vista, setVista] = useState<Vista>(() =>
    pendientes.length && !nuevaEtapa ? 'pendientes' : 'catalogo',
  );
  // `?nueva_etapa=` abre el alta con el literal copiado: tiene que coincidir con el de Odoo.
  const [borrador, setBorrador] = useState<Borrador | null>(() =>
    nuevaEtapa ? vacio(nuevaEtapa) : null,
  );
  const [borrando, setBorrando] = useState<EtapaSoporte | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ejecutar = async (accion: () => Promise<{ message?: string }>, fallo: string) => {
    setGuardando(true);
    setError(null);
    try {
      const r = await accion();
      setBorrador(null);
      setBorrando(null);
      setAviso(r.message ?? null);
      router.reload();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, fallo));
    } finally {
      setGuardando(false);
    }
  };

  const guardar = (event: FormEvent) => {
    event.preventDefault();
    if (borrador) ejecutar(() => supportApi.saveEtapa(borrador), 'No se pudo guardar la etapa.');
  };

  const columnasPendientes: Column<EtapaPendiente>[] = [
    { header: 'Etapa en los logs', accessor: 'etapa', sortKey: 'etapa' },
    { header: 'Logs', accessor: (r) => formatInteger(r.logs), align: 'right', sortKey: 'logs' },
    {
      header: 'Tickets',
      accessor: (r) => formatInteger(r.tickets),
      align: 'right',
      sortKey: 'tickets',
    },
    { header: 'Último', accessor: (r) => r.ultimo ?? '—', align: 'right', sortKey: 'ultimo' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (r) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setBorrador(vacio(r.etapa))}
          >
            Clasificar
          </Button>
        </div>
      ),
    },
  ];

  const columnasCatalogo: Column<EtapaSoporte>[] = [
    {
      header: 'Etapa',
      accessor: (r) => (
        <span>
          {r.nombre}
          {r.es_escalamiento && (
            <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-300">
              escalamiento
            </span>
          )}
        </span>
      ),
      sortKey: 'nombre',
    },
    {
      header: 'Equipo',
      accessor: (r) => ETIQUETA_EQUIPO[r.equipo],
      sortKey: 'equipo',
      filterable: true,
      filterValue: (r) => ETIQUETA_EQUIPO[r.equipo],
    },
    {
      header: 'Tipo',
      accessor: (r) => ETIQUETA_TIPO[r.tipo],
      sortKey: 'tipo',
      filterable: true,
      filterValue: (r) => ETIQUETA_TIPO[r.tipo],
    },
    { header: 'Logs', accessor: (r) => formatInteger(r.logs), align: 'right', sortKey: 'logs' },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              setBorrador({ id: r.id, nombre: r.nombre, equipo: r.equipo, tipo: r.tipo })
            }
            className="rounded-lg border border-sky-500/30 p-2 text-sky-400 hover:bg-sky-500/10"
            title="Editar"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setBorrando(r)}
            className="rounded-lg border border-rose-500/30 p-2 text-rose-400 hover:bg-rose-500/10"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout
      toolbar={
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl">
          <ToggleGroup
            activeKey={vista}
            onChange={(key) => setVista(key as Vista)}
            options={[
              {
                key: 'pendientes',
                label: `Por clasificar (${pendientes.length})`,
                icon: AlertTriangle,
              },
              { key: 'catalogo', label: `Etapas (${etapas.length})`, icon: ListChecks },
            ]}
          />
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setBorrador(vacio())}>
            Nueva etapa
          </Button>
        </div>
      }
    >
      <StatusMessage
        status={error ? { type: 'error', text: error } : null}
        className="mb-4"
        icon={<AlertTriangle />}
      />
      <StatusMessage status={aviso ? { type: 'success', text: aviso } : null} className="mb-4" />

      <NeonContainer
        title="Reglas fijas"
        subtitle="Lo que no depende del catálogo"
        icon={<Info className="h-5 w-5" />}
        theme="slate"
        className="mb-6"
      >
        <ul className="space-y-2 text-xs text-slate-300">
          <li>
            <strong className="text-white">Escalamiento:</strong> entrar en «{etapaEscalamiento}»
            viniendo de una etapa que no es de Soporte. Un ticket que nace en ella no está escalado.
          </li>
          <li>
            <strong className="text-white">Cierre:</strong> {etapasCierre.join(' y ')}. Son fijas,
            como en el resto del módulo, y cuentan para el equipo que tenía el ticket.
          </li>
          <li>
            <strong className="text-white">Compartida:</strong> la etapa es de ATC antes del
            escalamiento y de Soporte después; si el ticket nunca escaló, del equipo en que nació.
            Una etapa sin clasificar se trata igual y su tiempo va a «sin clasificar».
          </li>
          <li>
            <strong className="text-white">Cola</strong>: nadie lo ha tomado.{' '}
            <strong className="text-white">Pausa</strong>: espera algo de fuera (el cliente, un
            pago, una falla masiva). <strong className="text-white">Gestión</strong>: alguien
            trabaja en él.
          </li>
          <li>
            Los cambios se aplican al volver a ejecutar el análisis de soporte, en todos los meses.
          </li>
        </ul>
      </NeonContainer>

      {vista === 'pendientes' && (
        <NeonContainer
          title="Etapas por clasificar"
          subtitle="Aparecen en los logs cargados y el catálogo no dice de qué equipo son"
          icon={<AlertTriangle className="h-5 w-5" />}
          theme="yellow"
          noPadding
        >
          {pendientes.length === 0 ? (
            <EmptyState
              title="Todas las etapas están clasificadas"
              description="Ninguna etapa de los logs cargados falta en el catálogo."
              icon={<ListChecks />}
            />
          ) : (
            <DataTable
              columns={columnasPendientes}
              data={pendientes}
              searchable
              searchPlaceholder="Buscar etapa..."
            />
          )}
        </NeonContainer>
      )}

      {vista === 'catalogo' && (
        <NeonContainer
          title="Etapas"
          subtitle="Equipo y tipo de cada etapa de los tickets"
          icon={<GitBranch className="h-5 w-5" />}
          theme="blue"
          noPadding
        >
          {etapas.length === 0 ? (
            <EmptyState
              title="El catálogo está vacío"
              description="Clasifica las etapas desde la pestaña de pendientes."
              icon={<GitBranch />}
            />
          ) : (
            <DataTable
              columns={columnasCatalogo}
              data={etapas}
              searchable
              searchPlaceholder="Buscar etapa..."
            />
          )}
        </NeonContainer>
      )}

      <Modal
        isOpen={Boolean(borrador)}
        onClose={() => setBorrador(null)}
        title={borrador?.id ? 'Editar etapa' : 'Nueva etapa'}
        subtitle="El nombre exacto con que la etapa aparece en Odoo"
        icon={<GitBranch className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {borrador && (
          <form onSubmit={guardar} className="space-y-6">
            <TextField
              label="Etapa"
              icon={<GitBranch />}
              value={borrador.nombre}
              onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
              placeholder="En Progreso - Soporte Técnico"
              autoFocus
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">Equipo</label>
                <SelectMenu
                  value={borrador.equipo}
                  options={equipos}
                  onChange={(equipo) => setBorrador({ ...borrador, equipo })}
                  aria-label="Equipo"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">Tipo</label>
                <SelectMenu
                  value={borrador.tipo}
                  options={tipos}
                  onChange={(tipo) => setBorrador({ ...borrador, tipo })}
                  aria-label="Tipo"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
              <Button type="button" variant="outline" onClick={() => setBorrador(null)}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={guardando} icon={<Save className="h-4 w-4" />}>
                {borrador.id ? 'Guardar cambios' : 'Crear etapa'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(borrando)}
        onClose={() => setBorrando(null)}
        title="Confirmar eliminación"
        subtitle="Sus tramos pasarán a «sin clasificar» en el siguiente análisis"
        icon={<Trash2 className="h-5 w-5 text-rose-400" />}
        theme="red"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-300">
            ¿Eliminar <strong className="text-white">{borrando?.nombre}</strong> del catálogo?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBorrando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              isLoading={guardando}
              onClick={() =>
                borrando &&
                ejecutar(() => supportApi.deleteEtapa(borrando.id), 'No se pudo eliminar la etapa.')
              }
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
