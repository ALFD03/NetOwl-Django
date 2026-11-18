/** Los formularios de alta y edición de cada catálogo. */

import type { FormEvent, ReactNode } from 'react';
import {
  Building2, Cable, EyeOff, Gauge, Network, RadioTower,
  ShieldCheck, Tv2, User, UserCheck, Zap,
} from 'lucide-react';

import { SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup,
  TogglePill, type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type {
  IgnoredDraft, NameDraft, PlanDraft, RegulatoryDraft, ZoneDraft,
} from '@/features/subscriptions/hooks/useCatalogs';
import type {
  CatalogArea, CatalogNamed, CatalogOption, CatalogRegulatoryPlan, CatalogSite,
} from '@/features/subscriptions/types';

/** Valor del desplegable cuando el plan todavía no está agrupado. */
const NO_REGULATORY = '';

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
const DEFAULT_TECHNOLOGY = { icon: <Network />, description: '', tone: 'blue' as FormTone };
const DEFAULT_PERSON = { icon: <User />, description: '', tone: 'blue' as FormTone };

const PERSON_UI: Record<string, { icon: ReactNode; description: string; tone: FormTone }> = {
  nat: { icon: <User />, description: 'Suscriptor residencial. Suma como persona natural.', tone: 'blue' },
  PYME: { icon: <Building2 />, description: 'Empresa o comercio. Suma como persona jurídica.', tone: 'purple' },
};

function TecnologiaCards({
  options,
  value,
  onChange,
  label = 'Tecnología',
}: {
  options: CatalogOption[];
  value: string;
  onChange: (valor: string) => void;
  label?: string;
}) {
  return (
    <OptionCardGroup label={label} columns="md:grid-cols-2">
      {options.map((option) => {
        const ui = TECNOLOGIA_UI[option.value] ?? DEFAULT_TECHNOLOGY;
        return (
          <OptionCard
            key={option.value}
            icon={ui.icon}
            title={option.label}
            description={ui.description}
            tone={ui.tone}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
          />
        );
      })}
    </OptionCardGroup>
  );
}

export function PlanForm({
  value,
  technologies,
  personTypes,
  saving,
  onChange,
  onSubmit,
  onClose,
  regulators,
}: Acciones & {
  value: PlanDraft;
  technologies: CatalogOption[];
  personTypes: CatalogOption[];
  regulators: CatalogRegulatoryPlan[];
  onChange: (patch: Partial<PlanDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Declaración ante la reguladora"
        description="Si eliges «No declarar», el plan sigue siendo un plan en todo lo demás pero no suma en las matrices del reporte ETA."
        action={
          <TogglePill
            active={value.declare_in_eta}
            icon={<ShieldCheck />}
            activeLabel="Declarar en ETA"
            inactiveLabel="No declarar"
            onToggle={() => onChange({ declare_in_eta: !value.declare_in_eta })}
          />
        }
      />

      <TecnologiaCards
        options={technologies}
        value={value.technology}
        onChange={(tecnologia) => onChange({ technology: tecnologia })}
      />

      <OptionCardGroup label="Tipo de suscriptor" columns="md:grid-cols-2">
        {personTypes.map((option) => {
          const ui = PERSON_UI[option.value] ?? DEFAULT_PERSON;
          return (
            <OptionCard
              key={option.value}
              icon={ui.icon}
              title={option.label}
              description={ui.description}
              tone={ui.tone}
              selected={value.person_type === option.value}
              onSelect={() => onChange({ person_type: option.value })}
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
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>

          <Field
            label="Cuadro tarifario"
            hint="Déjalo vacío salvo que el plan tenga tarifa propia: es lo único que distingue dos planes con el mismo nombre."
          >
            <input
              type="text"
              className={modalInputClass}
              value={value.tariff}
              onChange={(e) => onChange({ tariff: e.target.value })}
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
              value={value.reference}
              onChange={(e) => onChange({ reference: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Velocidad (Mbps)">
              <input
                type="number"
                min="0"
                step="any"
                className={modalInputClass}
                value={value.data_mbps}
                onChange={(e) => onChange({ data_mbps: Number(e.target.value) })}
              />
            </Field>

            <Field label="Precio">
              <input
                type="number"
                min="0"
                step="any"
                className={modalInputClass}
                value={value.price}
                onChange={(e) => onChange({ price: Number(e.target.value) })}
              />
            </Field>
          </div>

          {value.person_type === 'PYME' && (
            <Field
              label="Comisión PYME (% del precio)"
              hint="Lo que cobra quien vende el plan, y solo esa persona. Vacío es «sin definir»: Comisiones avisa de esas ventas en vez de pagarlas a 0."
            >
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                className={modalInputClass}
                value={value.sme_commission_pct ?? ''}
                onChange={(e) => onChange({ sme_commission_pct: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </Field>
          )}

          <Field
            label="Plan regulador"
            hint="Con qué fila del formulario se declara. Varios planes comerciales pueden compartirla: es lo que evita contar dos veces la misma velocidad con dos tarifas. Sin asignar, el plan sigue contando en las matrices pero no aparece en el formulario."
          >
            <SelectMenu
              aria-label="Plan regulador"
              className={modalInputClass}
              value={String(value.regulator_plan_id ?? NO_REGULATORY)}
              options={[
                { value: NO_REGULATORY, label: 'Sin asignar — no se declara' },
                ...regulators.map((r) => ({ value: String(r.id), label: r.name })),
              ]}
              onChange={(id) => onChange({ regulator_plan_id: id ? Number(id) : null })}
            />
          </Field>

          <OptionCard
            className="w-full"
            icon={<Tv2 />}
            title="IPTV"
            description="El plan incluye televisión y suma en las matrices de TV del reporte."
            tone="sky"
            selected={value.has_tv}
            onSelect={() => onChange({ has_tv: !value.has_tv })}
          />
        </div>
      </FormColumns>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear plan'} />
    </ModalForm>
  );
}

export function RegulatoryPlanForm({
  value,
  technologies,
  personTypes,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: RegulatoryDraft;
  technologies: CatalogOption[];
  personTypes: CatalogOption[];
  onChange: (patch: Partial<RegulatoryDraft>) => void;
}) {
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Hoja del formulario"
        description="El transporte de datos se declara en su propia hoja, con otras columnas: medio de transmisión y número de enlaces en vez de velocidades de subida y bajada."
        action={
          <TogglePill
            active={value.is_transport}
            icon={<Cable />}
            activeLabel="Transporte de datos"
            inactiveLabel="Internet"
            onToggle={() => onChange({ is_transport: !value.is_transport })}
          />
        }
      />

      <TecnologiaCards
        options={technologies}
        value={value.technology}
        onChange={(tecnologia) => onChange({ technology: tecnologia })}
        label="Tecnología declarada"
      />

      <OptionCardGroup label="Tipo de suscriptor declarado" columns="md:grid-cols-2">
        {personTypes.map((option) => {
          const ui = PERSON_UI[option.value] ?? DEFAULT_PERSON;
          return (
            <OptionCard
              key={option.value}
              icon={ui.icon}
              title={option.label}
              description={ui.description}
              tone={ui.tone}
              selected={value.person_type === option.value}
              onSelect={() => onChange({ person_type: option.value })}
            />
          );
        })}
      </OptionCardGroup>

      <FormColumns>
        <div className="space-y-4">
          <Field
            label="Nombre del plan declarado"
            hint="Tal y como debe salir en el formulario. El internet dedicado y el transporte se nombran «Internet Dedicado N Mbps» y «Transporte de Datos N Mbps»: con ese nombre exacto, esta fila sustituye a la que se calcula sola."
          >
            <input
              type="text"
              required
              className={modalInputClass}
              placeholder="Internet Fibra 100 Mbps"
              value={value.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </Field>

          <Field
            label="Notas"
            hint="Para quien mantenga el catálogo. No sale en el formulario."
          >
            <input
              type="text"
              className={modalInputClass}
              value={value.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Velocidad (Mbps)"
              hint="De aquí salen las velocidades de subida, de bajada y el consumo teórico."
            >
              <input
                type="number"
                min="0"
                step="any"
                className={modalInputClass}
                value={value.data_mbps}
                onChange={(e) => onChange({ data_mbps: Number(e.target.value) })}
              />
            </Field>

            <Field
              label="Precio"
              hint="En divisa. La renta básica en bolívares es este precio por la tasa del BCV del mes, que se fija en el reporte."
            >
              <input
                type="number"
                min="0"
                step="any"
                className={modalInputClass}
                value={value.price}
                onChange={(e) => onChange({ price: Number(e.target.value) })}
              />
            </Field>
          </div>

          <OptionCard
            className="w-full"
            icon={<Tv2 />}
            title="IPTV"
            description="Además de su hoja, esta fila se declara en la de televisión con la parrilla de canales."
            tone="sky"
            selected={value.has_tv}
            onSelect={() => onChange({ has_tv: !value.has_tv })}
          />
        </div>
      </FormColumns>

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Crear plan regulador'}
      />
    </ModalForm>
  );
}

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
}: Acciones & {
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

      <TecnologiaCards
        options={technologies}
        value={value.technology}
        onChange={(tecnologia) => onChange({ technology: tecnologia })}
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
              options={states.map((estado) => ({ value: String(estado.id), label: estado.name }))}
              onChange={(estado_id) => onChange({ state_id: Number(estado_id) })}
            />
          </Field>

          {withCoordinator ? (
            <Field label="Coordinador">
              <SelectMenu
                aria-label="Coordinador"
                className={modalInputClass}
                value={String(value.coordinator_id ?? '')}
                options={coordinators.map((c) => ({ value: String(c.id), label: c.name }))}
                onChange={(coordinador_id) => onChange({ coordinator_id: Number(coordinador_id) })}
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

export function NameForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & { value: NameDraft; onChange: (patch: Partial<NameDraft>) => void }) {
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

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : 'Crear'} />
    </ModalForm>
  );
}

/** Lo que cambia del formulario de ignorar según la lista de la que sale el nombre. */
const IGNORED_TEXTS: Record<CatalogArea, {
  titulo: string; descripcion: string; campo: string; note: string; boton: string;
}> = {
  productos: {
    titulo: 'Producto que nunca será un plan',
    descripcion: 'Routers, instalaciones y servicios puntuales. Dejará de bloquear importaciones y análisis sin entrar en el catálogo de planes.',
    campo: 'Producto',
    note: 'Por qué nunca será un plan. Ayuda a revisar la decisión más adelante.',
    boton: 'Ignorar producto',
  },
  estructura: {
    titulo: 'Zona que no se registrará',
    descripcion: 'Una zona mal escrita en Odoo o que no es un nodo de verdad. Dejará de aparecer en Notificaciones sin entrar en el catálogo.',
    campo: 'Zona',
    note: 'Por qué no se registra. Ayuda a revisar la decisión más adelante.',
    boton: 'Ignorar zona',
  },
  ventas: {
    titulo: 'Vendedor que no se registrará',
    descripcion: 'Un canal o un usuario genérico que no es una persona de ventas. Dejará de aparecer en Notificaciones sin entrar en el directorio.',
    campo: 'Nombre',
    note: 'Por qué no se registra. Ayuda a revisar la decisión más adelante.',
    boton: 'Ignorar nombre',
  },
};

export function IgnoredForm({
  value,
  areas = [],
  saving,
  onChange,
  onSubmit,
  onClose,
}: Acciones & {
  value: IgnoredDraft;
  /** Entre qué listas se elige en un alta. El área no se cambia al editar. */
  areas?: CatalogOption[];
  onChange: (patch: Partial<IgnoredDraft>) => void;
}) {
  const textos = IGNORED_TEXTS[value.area];
  const eligeArea = !value.id && areas.length > 1;
  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title={textos.titulo}
        description={textos.descripcion}
        action={<EyeOff className="h-8 w-8 flex-shrink-0 text-slate-600" />}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {eligeArea && (
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

        <Field label={textos.campo} hint="Tal y como aparece en el export, carácter por carácter.">
          <input
            type="text"
            required
            className={modalInputClass}
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>

        <Field label="Nota" hint={textos.note}>
          <input
            type="text"
            className={modalInputClass}
            value={value.note}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </Field>
      </div>

      <FormFooter saving={saving} onClose={onClose} submitLabel={value.id ? 'Guardar cambios' : textos.boton} />
    </ModalForm>
  );
}
