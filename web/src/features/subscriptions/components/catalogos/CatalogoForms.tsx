/** Los formularios de alta y edición de cada catálogo. */

import type { FormEvent, ReactNode } from 'react';
import {
  Building2, EyeOff, Gauge, MapPin, Network, RadioTower, ShieldCheck,
  Tv2, User, UserCheck, Zap,
} from 'lucide-react';

import { SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup,
  TogglePill, type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type {
  IgnoradoDraft, NombreDraft, PlanDraft, SiteDraft, ZonaDraft,
} from '@/features/subscriptions/hooks/useCatalogos';
import type { CatalogoNombrado, CatalogoOption, CatalogoSite } from '@/features/subscriptions/types';

/**
 * Formularios de los catálogos, en el mismo lenguaje que el maestro ETA.
 *
 * Uno por catálogo y no un formulario genérico guiado por metadatos: un plan
 * tiene nueve campos con reglas propias y un estado tiene uno, y la versión
 * genérica acaba siendo más difícil de leer que las cinco explícitas. Lo que sí
 * se comparte es la forma —tarjetas, franja, pie—, que vive en `FormControls`.
 */

interface Acciones {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

/**
 * Cómo se presenta cada tecnología como tarjeta.
 *
 * Son dos y solo dos —la red es fibra o radio—, y las manda el servidor
 * (`TECNOLOGIA_CHOICES`): esto solo les pone cara.
 */
const TECNOLOGIA_UI: Record<string, { icon: ReactNode; description: string; tone: FormTone }> = {
  FTTH: { icon: <Zap />, description: 'Fibra hasta el hogar. Alámbrico para la reguladora.', tone: 'emerald' },
  RF: { icon: <RadioTower />, description: 'Radioenlace. Inalámbrico para la reguladora.', tone: 'amber' },
};

// Respaldo por si el servidor añadiera una opción que aquí no tiene cara: la
// tarjeta aparece igualmente, con icono genérico, en vez de desaparecer.
const TECNOLOGIA_POR_DEFECTO = { icon: <Network />, description: '', tone: 'blue' as FormTone };
const PERSONA_POR_DEFECTO = { icon: <User />, description: '', tone: 'blue' as FormTone };

const PERSONA_UI: Record<string, { icon: ReactNode; description: string; tone: FormTone }> = {
  nat: { icon: <User />, description: 'Suscriptor residencial. Suma como persona natural.', tone: 'blue' },
  PYME: { icon: <Building2 />, description: 'Empresa o comercio. Suma como persona jurídica.', tone: 'purple' },
};

function TecnologiaCards({
  opciones,
  valor,
  onChange,
  label = 'Tecnología',
}: {
  opciones: CatalogoOption[];
  valor: string;
  onChange: (valor: string) => void;
  label?: string;
}) {
  return (
    <OptionCardGroup label={label} columns="md:grid-cols-2">
      {opciones.map((opcion) => {
        const ui = TECNOLOGIA_UI[opcion.value] ?? TECNOLOGIA_POR_DEFECTO;
        return (
          <OptionCard
            key={opcion.value}
            icon={ui.icon}
            title={opcion.label}
            description={ui.description}
            tone={ui.tone}
            selected={valor === opcion.value}
            onSelect={() => onChange(opcion.value)}
          />
        );
      })}
    </OptionCardGroup>
  );
}

export function PlanForm({
  value,
  tecnologias,
  tiposPersona,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: PlanDraft;
  tecnologias: CatalogoOption[];
  tiposPersona: CatalogoOption[];
  onChange: (patch: Partial<PlanDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Declaración ante la reguladora"
        description="Si eliges «No declarar», el plan sigue siendo un plan en todo lo demás pero no suma en las matrices del reporte ETA."
        action={
          <TogglePill
            active={value.declarar_en_eta}
            icon={<ShieldCheck />}
            activeLabel="Declarar en ETA"
            inactiveLabel="No declarar"
            onToggle={() => onChange({ declarar_en_eta: !value.declarar_en_eta })}
          />
        }
      />

      <TecnologiaCards
        opciones={tecnologias}
        valor={value.tecnologia}
        onChange={(tecnologia) => onChange({ tecnologia })}
      />

      <OptionCardGroup label="Tipo de suscriptor" columns="md:grid-cols-2">
        {tiposPersona.map((opcion) => {
          const ui = PERSONA_UI[opcion.value] ?? PERSONA_POR_DEFECTO;
          return (
            <OptionCard
              key={opcion.value}
              icon={ui.icon}
              title={opcion.label}
              description={ui.description}
              tone={ui.tone}
              selected={value.tipo_persona === opcion.value}
              onSelect={() => onChange({ tipo_persona: opcion.value })}
            />
          );
        })}
      </OptionCardGroup>

      <FormColumns>
        <div className="space-y-4">
          <Field
            label="Nombre del plan"
            hint="Debe coincidir exactamente con el producto que trae el export de Odoo."
          >
            <input
              type="text"
              required
              className={modalInputClass}
              value={value.nombre}
              onChange={(e) => onChange({ nombre: e.target.value })}
            />
          </Field>

          <Field
            label="Cuadro tarifario"
            hint="Déjalo vacío salvo que el plan tenga tarifa propia: es lo único que distingue dos planes con el mismo nombre."
          >
            <input
              type="text"
              className={modalInputClass}
              value={value.tarifa}
              onChange={(e) => onChange({ tarifa: e.target.value })}
            />
          </Field>

          <Field
            label="Referencia regulatoria"
            hint="Cómo se llama este plan en el cuadro de la reguladora."
          >
            <input
              type="text"
              className={modalInputClass}
              placeholder="RESIDENCIAL FTTH HASTA 400 Mbps"
              value={value.referencia}
              onChange={(e) => onChange({ referencia: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Velocidad (Mbps)">
              <input
                type="number"
                min="0"
                step="any"
                className={modalInputClass}
                value={value.datas_mbps}
                onChange={(e) => onChange({ datas_mbps: Number(e.target.value) })}
              />
            </Field>

            <Field label="Precio">
              <input
                type="number"
                min="0"
                step="any"
                className={modalInputClass}
                value={value.precio}
                onChange={(e) => onChange({ precio: Number(e.target.value) })}
              />
            </Field>
          </div>

          <OptionCard
            className="w-full"
            icon={<Tv2 />}
            title="IPTV"
            description="El plan incluye televisión y suma en las matrices de TV del reporte."
            tone="sky"
            selected={value.tiene_tv}
            onSelect={() => onChange({ tiene_tv: !value.tiene_tv })}
          />
        </div>
      </FormColumns>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear plan'} />
    </ModalForm>
  );
}

export function ZonaForm({
  value,
  sites,
  estados,
  coordinadores,
  tecnologias,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: ZonaDraft;
  sites: CatalogoSite[];
  estados: CatalogoNombrado[];
  coordinadores: CatalogoNombrado[];
  tecnologias: CatalogoOption[];
  onChange: (patch: Partial<ZonaDraft>) => void;
}) {
  const conCoordinador = value.coordinador_id !== null;

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Agrupación en Business Units"
        description="Solo las zonas con coordinador aparecen agrupadas en ese reporte. El resto siguen contando en todos los demás."
        action={
          <TogglePill
            active={conCoordinador}
            icon={<UserCheck />}
            activeLabel="Con coordinador"
            inactiveLabel="Sin coordinador"
            onToggle={() =>
              onChange({ coordinador_id: conCoordinador ? null : (coordinadores[0]?.id ?? null) })
            }
          />
        }
      />

      <TecnologiaCards
        opciones={tecnologias}
        valor={value.tecnologia}
        onChange={(tecnologia) => onChange({ tecnologia })}
        label="Tecnología del nodo"
      />

      <FormColumns>
        <div className="space-y-4">
          <Field
            label="Nombre de la zona"
            hint="Debe coincidir con la columna «Zona» del export; es la dimensión por la que se desglosa casi toda métrica."
          >
            <input
              type="text"
              required
              className={modalInputClass}
              value={value.nombre}
              onChange={(e) => onChange({ nombre: e.target.value })}
            />
          </Field>

          <Field label="Site" hint="Sede regional bajo la que se agrupa en el Sales Report.">
            <SelectMenu
              aria-label="Site"
              className={modalInputClass}
              value={String(value.site_id ?? '')}
              options={sites.map((site) => ({ value: String(site.id), label: site.nombre }))}
              onChange={(site_id) => onChange({ site_id: Number(site_id) })}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Estado" hint="Entidad federal por la que agrupa el reporte ETA.">
            <SelectMenu
              aria-label="Estado"
              className={modalInputClass}
              value={String(value.estado_id ?? '')}
              options={estados.map((estado) => ({ value: String(estado.id), label: estado.nombre }))}
              onChange={(estado_id) => onChange({ estado_id: Number(estado_id) })}
            />
          </Field>

          {conCoordinador ? (
            <Field label="Coordinador">
              <SelectMenu
                aria-label="Coordinador"
                className={modalInputClass}
                value={String(value.coordinador_id ?? '')}
                options={coordinadores.map((c) => ({ value: String(c.id), label: c.nombre }))}
                onChange={(coordinador_id) => onChange({ coordinador_id: Number(coordinador_id) })}
              />
            </Field>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-surface-tertiary/30 p-4">
              <p className="text-[10px] leading-relaxed text-slate-400">
                Esta zona no se agrupará por coordinador. Actívalo arriba para asignarle uno.
              </p>
            </div>
          )}
        </div>
      </FormColumns>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear zona'} />
    </ModalForm>
  );
}

export function SiteForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & { value: SiteDraft; onChange: (patch: Partial<SiteDraft>) => void }) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Sede regional"
        description="Agrupa zonas en el Sales Report. Eliminarla exige que ninguna zona la referencie."
        action={<MapPin className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Nombre del site">
          <input
            type="text"
            required
            className={modalInputClass}
            value={value.nombre}
            onChange={(e) => onChange({ nombre: e.target.value })}
          />
        </Field>

        <Field
          label="Orden de presentación"
          hint="Menor número, más arriba. Los reportes no ordenan los sites alfabéticamente sino por relevancia comercial."
        >
          <input
            type="number"
            min="0"
            className={modalInputClass}
            value={value.orden}
            onChange={(e) => onChange({ orden: Number(e.target.value) })}
          />
        </Field>
      </div>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear site'} />
    </ModalForm>
  );
}

export function NombreForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & { value: NombreDraft; onChange: (patch: Partial<NombreDraft>) => void }) {
  const esCoordinador = value.tipo === 'coordinadores';

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={esCoordinador ? 'Responsable comercial' : 'Entidad federal'}
        description={
          esCoordinador
            ? 'Business Units agrupa por aquí las zonas que se le asignen.'
            : 'El reporte ETA agrupa por aquí a los suscriptores de cada zona.'
        }
        action={
          esCoordinador ? (
            <UserCheck className="h-8 w-8 flex-shrink-0 text-slate-600" />
          ) : (
            <Gauge className="h-8 w-8 flex-shrink-0 text-slate-600" />
          )
        }
      />

      <Field
        label="Nombre"
        hint="Reasigna sus zonas antes de eliminarlo: mientras alguna lo referencie, el borrado se rechaza."
      >
        <input
          type="text"
          required
          className={modalInputClass}
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
        />
      </Field>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}

export function IgnoradoForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & { value: IgnoradoDraft; onChange: (patch: Partial<IgnoradoDraft>) => void }) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Producto que nunca será un plan"
        description="Routers, instalaciones y servicios puntuales. Dejará de bloquear importaciones y análisis sin entrar en el catálogo de planes."
        action={<EyeOff className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Producto" hint="Tal y como aparece en el export, carácter por carácter.">
          <input
            type="text"
            required
            className={modalInputClass}
            value={value.nombre}
            onChange={(e) => onChange({ nombre: e.target.value })}
          />
        </Field>

        <Field label="Nota" hint="Por qué nunca será un plan. Ayuda a revisar la decisión más adelante.">
          <input
            type="text"
            className={modalInputClass}
            value={value.nota}
            onChange={(e) => onChange({ nota: e.target.value })}
          />
        </Field>
      </div>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Ignorar producto'} />
    </ModalForm>
  );
}
