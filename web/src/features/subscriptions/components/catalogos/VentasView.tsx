/** Catálogos › Ventas: coordinadores de unidad de negocio y objetivos comerciales. */

import { Target, TrafficCone, UserCheck } from 'lucide-react';

import { AppLayout } from '@/shared/layout/AppLayout';
import { DataTable, Modal, NeonContainer, type Column } from '@/shared/ui';
import { useCatalogos } from '@/features/subscriptions/hooks/useCatalogos';
import type { CatalogoNombrado, CatalogosVentasProps } from '@/features/subscriptions/types';
import { NombreForm } from './CatalogoForms';
import { BarraCatalogo, ConfirmarBorrado, ErrorCatalogo, columnaAcciones, enviar } from './CatalogoComun';
import { NIVEL_OBJETIVO_UI, ObjetivoForm, ObjetivoMesForm, SemaforoForm } from './ObjetivoForms';
import { ObjetivosPanel } from './ObjetivosPanel';
import { objetivoGeneral } from '../../lib/objetivos';

/**
 * Cómo se organizan los equipos de venta y qué se espera de cada parte de la
 * red. Los coordinadores son los de Unidades de negocio: cada uno es dueño de
 * un conjunto de zonas, que se le asignan desde Estructura.
 */
export function VentasView({
  coordinadores,
  objetivos,
  objetivos_mes: objetivosMes,
  semaforo,
  objetivosConfig,
  periodosCalculados,
  nodosConocidos,
  zonas,
  sites,
  estados,
}: CatalogosVentasProps) {
  const c = useCatalogos({ vistaInicial: 'coordinadores' });

  // El general que rige hoy, para decir en los formularios qué se hereda si
  // se deja un valor vacío. La excepción de un mes no cuenta como "heredado"
  // de ese mismo mes, de ahí la configuración sin `meses`.
  const mesReferencia = periodosCalculados[0] ?? new Date().toISOString().slice(0, 7);
  const generalHoy = objetivoGeneral(objetivosConfig, mesReferencia);
  // Solo los nodos cuya zona está en el catálogo pueden tener objetivo de nodo:
  // el objetivo cuelga de la zona. La sucursal, en cambio, vale sin catálogo.
  const nombresZona = new Set(zonas.map((z) => z.nombre.toLowerCase()));
  const nodosDelCatalogo = nodosConocidos.filter((n) => nombresZona.has(n.zona.toLowerCase()));
  const generalSinExcepcion = (periodo: string) =>
    objetivoGeneral({ ...objetivosConfig, meses: {} }, periodo || mesReferencia);

  const columnasCoordinadores: Column<CatalogoNombrado>[] = [
    { header: 'Nombre', accessor: 'nombre', sortKey: 'nombre' },
    { header: 'Zonas', accessor: 'zonas', align: 'right', sortKey: 'zonas' },
    columnaAcciones<CatalogoNombrado>(
      (row) => c.editarNombre('coordinadores', row),
      (row) => c.setBorrando({ tipo: 'coordinadores', id: row.id, nombre: row.nombre }),
    ),
  ];

  const altas = {
    coordinadores: { label: 'Nuevo coordinador', onClick: () => c.nuevoNombre('coordinadores') },
  } as Record<string, { label: string; onClick: () => void }>;

  return (
    <AppLayout
      toolbar={
        <BarraCatalogo
          activa={c.vista}
          onChange={(key) => c.setVista(key as typeof c.vista)}
          alta={altas[c.vista]}
          pestanas={[
            { key: 'coordinadores', label: `Coordinadores de UN (${coordinadores.length})`, icon: UserCheck },
            { key: 'objetivos', label: 'Objetivos', icon: Target },
          ]}
        />
      }
    >
      <ErrorCatalogo c={c} />

      {c.vista === 'coordinadores' && (
        <NeonContainer title="Coordinadores de unidad de negocio" subtitle="Responsables comerciales por los que agrupa Unidades de negocio" icon={<UserCheck className="h-5 w-5" />} theme="green" noPadding>
          <DataTable columns={columnasCoordinadores} data={coordinadores} searchable searchPlaceholder="Buscar coordinador..." />
        </NeonContainer>
      )}

      {c.vista === 'objetivos' && (
        <ObjetivosPanel
          objetivos={objetivos}
          objetivosMes={objetivosMes}
          semaforo={semaforo}
          config={objetivosConfig}
          periodos={periodosCalculados}
          zonas={zonas}
          nodos={nodosConocidos}
          onEditarGeneral={c.editarObjetivo}
          onNuevoObjetivo={() => c.nuevoObjetivo('zona')}
          onEditarObjetivo={c.editarObjetivo}
          onBorrarObjetivo={(fila) =>
            c.setBorrando({
              tipo: 'objetivos',
              id: fila.id,
              nombre: `el objetivo ${NIVEL_OBJETIVO_UI[fila.nivel].label.toLowerCase()} ${fila.entidad} ${fila.desde ? `desde ${fila.desde}` : 'desde siempre'}`.replace(/\s+/g, ' '),
            })}
          onExcepcionMes={(periodo, existente) =>
            (existente ? c.editarObjetivoMes(existente) : c.nuevoObjetivoMes(periodo))}
          onBorrarMes={(fila) =>
            c.setBorrando({ tipo: 'objetivos_mes', id: fila.id, nombre: `la excepción de ${fila.periodo}` })}
          onEditarSemaforo={() => c.editarSemaforo(semaforo)}
        />
      )}

      <Modal
        isOpen={Boolean(c.nombreDraft)}
        onClose={c.cerrarFormularios}
        title="Coordinador de unidad de negocio"
        subtitle="Responsable comercial de un conjunto de zonas"
        icon={<UserCheck className="h-5 w-5 text-emerald-400" />}
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

      <Modal
        isOpen={Boolean(c.objetivoDraft)}
        onClose={c.cerrarFormularios}
        title={c.objetivoDraft?.id ? 'Editar objetivo' : 'Nuevo objetivo'}
        subtitle="Meta de crecimiento y churn máximo. No cambia ningún análisis: solo metas, cumplimiento y colores"
        icon={<Target className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.objetivoDraft && (
          <ObjetivoForm
            value={c.objetivoDraft}
            entidades={{ zona: zonas, site: sites, estado: estados, coordinador: coordinadores }}
            nodos={nodosDelCatalogo}
            general={generalHoy}
            saving={c.guardando}
            onChange={(patch) => c.setObjetivoDraft({ ...c.objetivoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('objetivos', { ...c.objetivoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.objetivoMesDraft)}
        onClose={c.cerrarFormularios}
        title={c.objetivoMesDraft?.id ? 'Editar excepción del mes' : 'Excepción de un mes'}
        subtitle="Sustituye al objetivo general solo en ese mes"
        icon={<Target className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {c.objetivoMesDraft && (
          <ObjetivoMesForm
            value={c.objetivoMesDraft}
            periodos={periodosCalculados}
            general={generalSinExcepcion(c.objetivoMesDraft.periodo)}
            saving={c.guardando}
            onChange={(patch) => c.setObjetivoMesDraft({ ...c.objetivoMesDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('objetivos_mes', { ...c.objetivoMesDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.semaforoDraft)}
        onClose={c.cerrarFormularios}
        title="Semáforo de objetivos"
        subtitle="Desde dónde es verde, amarillo o rojo cada métrica, igual en todo el módulo"
        icon={<TrafficCone className="h-5 w-5 text-amber-400" />}
        theme="yellow"
      >
        {c.semaforoDraft && (
          <SemaforoForm
            value={c.semaforoDraft}
            saving={c.guardando}
            onChange={(patch) => c.setSemaforoDraft({ ...c.semaforoDraft!, ...patch })}
            onSubmit={(e) => enviar(e, () => c.guardar('semaforo', { ...c.semaforoDraft }))}
            onClose={c.cerrarFormularios}
          />
        )}
      </Modal>

      <ConfirmarBorrado c={c} />
    </AppLayout>
  );
}
