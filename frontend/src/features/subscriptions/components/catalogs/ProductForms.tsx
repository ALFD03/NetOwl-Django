/** Los formularios del grupo Productos: el plan y el plan regulador. */

import type { ReactNode } from 'react';
import { Building2, Cable, Network, RadioTower, ShieldCheck, Tv2, User, Zap } from 'lucide-react';

import { SelectMenu } from '@/shared/ui';
import {
  FormActions,
  Field,
  FormBanner,
  FormColumns,
  FormFooter,
  ModalForm,
  OptionCard,
  OptionCardGroup,
  TogglePill,
  type FormTone,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';
import type { PlanDraft, RegulatoryDraft } from '@/features/subscriptions/lib/catalogDrafts';
import type { CatalogOption, CatalogRegulatoryPlan } from '@/features/subscriptions/types';

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

/**
 * Cómo se presenta cada tecnología como tarjeta.
 *
 * Son dos y solo dos —la red es fibra o radio—, y las manda el servidor
 * (`TECNOLOGIA_CHOICES`): esto solo les pone cara.
 */
const TECHNOLOGY_UI: Record<string, { icon: ReactNode; description: string; tone: FormTone }> = {
  FTTH: {
    icon: <Zap />,
    description: 'Fibra hasta el hogar. Alámbrico para la reguladora.',
    tone: 'emerald',
  },
  RF: {
    icon: <RadioTower />,
    description: 'Radioenlace. Inalámbrico para la reguladora.',
    tone: 'amber',
  },
};

// Respaldo por si el servidor añadiera una opción que aquí no tiene cara: la
// tarjeta aparece igualmente, con icono genérico, en vez de desaparecer.
const DEFAULT_TECHNOLOGY = { icon: <Network />, description: '', tone: 'blue' as FormTone };
const DEFAULT_PERSON = { icon: <User />, description: '', tone: 'blue' as FormTone };

const PERSON_UI: Record<string, { icon: ReactNode; description: string; tone: FormTone }> = {
  nat: {
    icon: <User />,
    description: 'Suscriptor residencial. Suma como persona natural.',
    tone: 'blue',
  },
  PYME: {
    icon: <Building2 />,
    description: 'Empresa o comercio. Suma como persona jurídica.',
    tone: 'purple',
  },
};

export function TechnologyCards({
  options,
  value,
  onChange,
  label = 'Tecnología',
}: {
  options: CatalogOption[];
  value: string;
  onChange: (inputValue: string) => void;
  label?: string;
}) {
  return (
    <OptionCardGroup label={label} columns="md:grid-cols-2">
      {options.map((option) => {
        const ui = TECHNOLOGY_UI[option.value] ?? DEFAULT_TECHNOLOGY;
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
}: FormActions & {
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

      <TechnologyCards
        options={technologies}
        value={value.technology}
        onChange={(technology) => onChange({ technology })}
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
                onChange={(e) =>
                  onChange({
                    sme_commission_pct: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
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

      <FormFooter
        saving={saving}
        onClose={onClose}
        submitLabel={value.id ? 'Guardar cambios' : 'Crear plan'}
      />
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
}: FormActions & {
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

      <TechnologyCards
        options={technologies}
        value={value.technology}
        onChange={(technology) => onChange({ technology })}
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

          <Field label="Notas" hint="Para quien mantenga el catálogo. No sale en el formulario.">
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
