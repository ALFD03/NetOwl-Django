/** Los formularios del grupo Estructura (zona y estado) y el de un nombre ignorado de Notificaciones. */

import { EyeOff, Gauge, UserCheck } from 'lucide-react';

import { SelectMenu } from '@/shared/ui';
import {
  FormActions,
  Field,
  FormBanner,
  FormColumns,
  FormFooter,
  ModalForm,
  TogglePill,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type {
  IgnoredDraft,
  NameDraft,
  ZoneDraft,
} from '@/features/subscriptions/lib/catalogDrafts';
import type {
  CatalogArea,
  CatalogNamed,
  CatalogOption,
  CatalogSite,
} from '@/features/subscriptions/types';
import { TechnologyCards } from './ProductForms';

export function ZoneForm({
  value,
  sites,
  states,
  coordinators,
  technologies,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: ZoneDraft;
  sites: CatalogSite[];
  states: CatalogNamed[];
  coordinators: CatalogNamed[];
  technologies: CatalogOption[];
  onChange: (patch: Partial<ZoneDraft>) => void;
}) {
  const withCoordinator = value.coordinator_id !== null;

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Agrupación en Business Units"
        description="Solo las zonas con coordinador aparecen agrupadas en ese reporte. El resto siguen contando en todos los demás."
        action={
          <TogglePill
            active={withCoordinator}
            icon={<UserCheck />}
            activeLabel="Con coordinador"
            inactiveLabel="Sin coordinador"
            onToggle={() =>
              onChange({ coordinator_id: withCoordinator ? null : (coordinators[0]?.id ?? null) })
            }
          />
        }
      />

      <TechnologyCards
        options={technologies}
        value={value.technology}
        onChange={(technology) => onChange({ technology })}
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
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>

          <Field label="Site" hint="Sede regional bajo la que se agrupa en el Sales Report.">
            <SelectMenu
              aria-label="Site"
              className={modalInputClass}
              value={String(value.site_id ?? '')}
              options={sites.map((site) => ({ value: String(site.id), label: site.name }))}
              onChange={(site_id) => onChange({ site_id: Number(site_id) })}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Estado" hint="Entidad federal por la que agrupa el reporte ETA.">
            <SelectMenu
              aria-label="Estado"
              className={modalInputClass}
              value={String(value.state_id ?? '')}
              options={states.map((state) => ({ value: String(state.id), label: state.name }))}
              onChange={(state_id) => onChange({ state_id: Number(state_id) })}
            />
          </Field>

          {withCoordinator ? (
            <Field label="Coordinador">
              <SelectMenu
                aria-label="Coordinador"
                className={modalInputClass}
                value={String(value.coordinator_id ?? '')}
                options={coordinators.map((c) => ({ value: String(c.id), label: c.name }))}
                onChange={(coordinator_id) => onChange({ coordinator_id: Number(coordinator_id) })}
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

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Crear zona'}
      />
    </ModalForm>
  );
}

export function NameForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & { value: NameDraft; onChange: (patch: Partial<NameDraft>) => void }) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Entidad federal"
        description="El reporte ETA agrupa por aquí a los suscriptores de cada zona."
        action={<Gauge className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <Field
        label="Nombre"
        hint="Reasigna sus zonas antes de eliminarlo: mientras alguna lo referencie, el borrado se rechaza."
      >
        <input
          type="text"
          required
          className={modalInputClass}
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Crear'}
      />
    </ModalForm>
  );
}

/** Lo que cambia del formulario de ignorar según la lista de la que sale el nombre. */
const IGNORED_TEXTS: Record<
  CatalogArea,
  {
    title: string;
    description: string;
    field: string;
    note: string;
    button: string;
  }
> = {
  productos: {
    title: 'Producto que nunca será un plan',
    description:
      'Routers, instalaciones y servicios puntuales. Dejará de bloquear importaciones y análisis sin entrar en el catálogo de planes.',
    field: 'Producto',
    note: 'Por qué nunca será un plan. Ayuda a revisar la decisión más adelante.',
    button: 'Ignorar producto',
  },
  estructura: {
    title: 'Zona que no se registrará',
    description:
      'Una zona mal escrita en Odoo o que no es un nodo de verdad. Dejará de aparecer en Notificaciones sin entrar en el catálogo.',
    field: 'Zona',
    note: 'Por qué no se registra. Ayuda a revisar la decisión más adelante.',
    button: 'Ignorar zona',
  },
  ventas: {
    title: 'Vendedor que no se registrará',
    description:
      'Un canal o un usuario genérico que no es una persona de ventas. Dejará de aparecer en Notificaciones sin entrar en el directorio.',
    field: 'Nombre',
    note: 'Por qué no se registra. Ayuda a revisar la decisión más adelante.',
    button: 'Ignorar nombre',
  },
};

export function IgnoredForm({
  value,
  areas = [],
  saving,
  onChange,
  onSubmit,
  onClose,
}: FormActions & {
  value: IgnoredDraft;
  /** Entre qué listas se elige en un alta. El área no se cambia al editar. */
  areas?: CatalogOption[];
  onChange: (patch: Partial<IgnoredDraft>) => void;
}) {
  const texts = IGNORED_TEXTS[value.area];
  const choosesArea = !value.id && areas.length > 1;
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={texts.title}
        description={texts.description}
        action={<EyeOff className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {choosesArea && (
          <Field label="Lista" hint="De qué lista de pendientes se calla el nombre.">
            <SelectMenu
              aria-label="Lista"
              className={modalInputClass}
              value={value.area}
              options={areas}
              onChange={(area) => onChange({ area: area as CatalogArea })}
            />
          </Field>
        )}

        <Field label={texts.field} hint="Tal y como aparece en el export, carácter por carácter.">
          <input
            type="text"
            required
            className={modalInputClass}
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>

        <Field label="Nota" hint={texts.note}>
          <input
            type="text"
            className={modalInputClass}
            value={value.note}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </Field>
      </div>

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : texts.button}
      />
    </ModalForm>
  );
}
