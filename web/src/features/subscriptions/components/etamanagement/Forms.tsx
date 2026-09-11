/** El formulario de la excepción individual de una suscripción. */

import { EtaPlanConfig, EtaSubscriptionConfig } from '@/shared/types';
import { Network, PenLine, ShieldCheck, Tv2, Wifi, X, Zap } from 'lucide-react';
import { FormEvent } from 'react';

import { SelectMenu } from '@/shared/ui';
import {
  Field, FormBanner, FormColumns, FormFooter, ModalForm, OptionCard, OptionCardGroup, TogglePill,
} from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';

type ServiceType = 'standard' | 'dedicated' | 'transport';

function getServiceType(value: EtaSubscriptionConfig): ServiceType {
  if (value.es_dedicado) {
    return 'dedicated';
  }

  if (value.es_transporte) {
    return 'transport';
  }

  return 'standard';
}

/**
 * Excepción de una suscripción concreta en el reporte ETA.
 *
 * Es lo único que ETA parametriza: la clasificación de un plan se edita en el
 * catálogo. Las tarjetas, la franja y el pie salen de `FormControls`, que es de
 * donde los toma también la pantalla de catálogos.
 */
export function SubscriptionForm({
  value,
  plans,
  custom,
  saving,
  onCustomChange,
  onPlanChange,
  onChange,
  onSubmit,
  onClose,
}: {
  value: EtaSubscriptionConfig;
  plans: EtaPlanConfig[];
  custom: boolean;
  saving: boolean;
  onCustomChange: (custom: boolean) => void;
  onPlanChange: (name: string) => void;
  onChange: (patch: Partial<EtaSubscriptionConfig>) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const serviceType = getServiceType(value);

  const handleServiceChange = (type: ServiceType) => {
    onChange({
      es_dedicado: type === 'dedicated',
      es_transporte: type === 'transport',
    });
  };

  return (
    <ModalForm onSubmit={onSubmit}>
      <FormBanner
        title="Estado en el Reporte ETA"
        description='Si seleccionas "No Declarar", se resolverá la alerta y el cliente no sumará en las matrices.'
        action={
          <TogglePill
            active={Boolean(value.reportar)}
            icon={<ShieldCheck />}
            activeLabel="Declarar en Reporte"
            inactiveLabel="No Declarar"
            onToggle={() => onChange({ reportar: !value.reportar })}
          />
        }
      />

      <OptionCardGroup label="Tipo de Servicio para el Regulador">
        <OptionCard
          icon={<Wifi />}
          title="Internet Estándar"
          description="Acceso público regular. Suma a las matrices y velocidades."
          tone="blue"
          selected={serviceType === 'standard'}
          onSelect={() => handleServiceChange('standard')}
        />

        <OptionCard
          icon={<Zap />}
          title="Internet Dedicado"
          description="Enlace corporativo. Suma a matrices de Internet."
          tone="emerald"
          selected={serviceType === 'dedicated'}
          onSelect={() => handleServiceChange('dedicated')}
        />

        <OptionCard
          icon={<Network />}
          title="Transporte de Datos"
          description="Circuito L2. Se separa del universo de Internet."
          tone="amber"
          selected={serviceType === 'transport'}
          onSelect={() => handleServiceChange('transport')}
        />
      </OptionCardGroup>

      <FormColumns>
        <div className="space-y-4">
          <Field label="ID de Orden / Suscripción">
            <input
              type="text"
              required
              className={modalInputClass}
              value={value.orden}
              onChange={(event) => onChange({ orden: event.target.value })}
            />
          </Field>

          <Field label="Nombre del Cliente">
            <input
              type="text"
              className={modalInputClass}
              value={value.cliente ?? ''}
              onChange={(event) => onChange({ cliente: event.target.value })}
            />
          </Field>

          <Field
            label="Plan / Producto"
            action={
              <button
                type="button"
                onClick={() => onCustomChange(!custom)}
                className="flex items-center gap-1 text-[10px] font-semibold text-brand hover:underline"
              >
                <PenLine className="h-3 w-3" />
                {custom ? 'Seleccionar plan' : 'Escribir manual'}
              </button>
            }
          >
            {!custom ? (
              <SelectMenu
                aria-label="Plan"
                className={modalInputClass}
                value={value.producto ?? ''}
                placeholder="-- Selecciona un plan del catálogo --"
                options={[
                  { value: '', label: '-- Selecciona un plan del catálogo --' },
                  ...plans.map((plan) => {
                    const planName = String(plan.name ?? plan.plan_name);
                    return { value: planName, label: planName };
                  }),
                  { value: '__CUSTOM__', label: '➕ Otro / Escribir producto personalizado...' },
                ]}
                onChange={onPlanChange}
              />
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  className={modalInputClass}
                  value={value.producto ?? ''}
                  onChange={(event) => onChange({ producto: event.target.value })}
                />

                <button
                  type="button"
                  onClick={() => onCustomChange(false)}
                  className="rounded-xl border border-slate-700 px-3 text-slate-400 hover:border-slate-600 hover:text-white"
                  title="Volver al catálogo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </Field>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tecnología">
              <SelectMenu
                aria-label="Tecnología"
                className={modalInputClass}
                value={value.tecnologia ?? 'FTTH'}
                options={[
                  { value: 'FTTH', label: 'Alámbrico' },
                  { value: 'RF', label: 'Inalámbrico' },
                ]}
                onChange={(tecnologia) => onChange({ tecnologia })}
              />
            </Field>

            <Field label="Tipo Persona">
              <SelectMenu
                aria-label="Tipo de persona"
                className={modalInputClass}
                value={value.tipo_persona ?? 'pyme'}
                options={[
                  { value: 'pyme', label: 'Jurídica' },
                  { value: 'nat', label: 'Natural' },
                ]}
                onChange={(tipo_persona) => onChange({ tipo_persona })}
              />
            </Field>
          </div>

          <Field label="Velocidad Asignada (Mbps)">
            <input
              type="number"
              min="0"
              className={modalInputClass}
              value={value.datas_mbps ?? 0}
              onChange={(event) => onChange({ datas_mbps: Number(event.target.value) })}
            />
          </Field>

          <OptionCard
            className="w-full"
            icon={<Tv2 />}
            title="IPTV"
            description="El suscriptor tiene un plan con tv rastreable para la declaracion"
            tone="sky"
            selected={Boolean(value.tiene_tv)}
            onSelect={() => onChange({ tiene_tv: !value.tiene_tv })}
          />
        </div>
      </FormColumns>

      <FormFooter saving={saving} onClose={onClose} submitLabel="Guardar Cambios" />
    </ModalForm>
  );
}
