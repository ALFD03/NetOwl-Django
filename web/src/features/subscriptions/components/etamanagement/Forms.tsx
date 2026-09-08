import { EtaPlanConfig, EtaSubscriptionConfig } from '@/shared/types';
import {
  CheckCircle2,
  Network,
  PenLine,
  Save,
  ShieldCheck,
  Tv2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { FormEvent } from 'react';
import { inputClass, labelClass } from './EtaView';


const modalInputClass =
  'w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:border-brand outline-none';

const modalLabelClass =
  'text-[10px] font-bold text-slate-400 uppercase';

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
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="p-4 rounded-2xl border border-slate-800 bg-surface-tertiary/30 flex items-center justify-between">
        <div>
          <h6 className="text-xs font-bold text-white">Estado en el Reporte ETA</h6>
          <p className="text-[10px] text-slate-400">
            Si seleccionas "No Declarar", se resolverá la alerta y el cliente
            no sumará en las matrices.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              reportar: !value.reportar,
            })
          }
          className={['px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2',
            value.reportar
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-800 text-slate-400 border border-slate-700',
          ].join(' ')}>
          <ShieldCheck className="w-4 h-4" />
          {value.reportar ? 'Declarar en Reporte' : 'No Declarar'}
        </button>
      </div>

      {/* TIPO DE SERVICIO */}
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
          Tipo de Servicio para el Regulador
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* INTERNET ESTÁNDAR */}
          <button
            type="button"
            onClick={() => handleServiceChange('standard')}
            className={[
              'p-4 rounded-2xl border cursor-pointer transition-all',
              'flex flex-col justify-between text-left',
              serviceType === 'standard'
                ? 'bg-blue-800/20 border-blue-800 ring-1 ring-blue-800 shadow-lg shadow-blue-800/10'
                : 'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100',
            ].join(' ')}>
            <div className="flex items-center justify-between mb-2">
              <Wifi
                className={[
                  'w-5 h-5',
                  serviceType === 'standard'
                    ? 'text-blue-800'
                    : 'text-slate-400',
                ].join(' ')}/>
              {serviceType === 'standard' && (
                <CheckCircle2 className="w-4 h-4 text-blue-800" />
              )}
            </div>

            <div>
              <h6 className="text-xs font-bold text-white">
                Internet Estándar
              </h6>
              <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                Acceso público regular. Suma a las matrices y velocidades.
              </p>
            </div>
          </button>

          {/* INTERNET DEDICADO */}
          <button
            type="button"
            onClick={() => handleServiceChange('dedicated')}
            className={[
              'p-4 rounded-2xl border cursor-pointer transition-all',
              'flex flex-col justify-between text-left',
              serviceType === 'dedicated'
                ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500 shadow-lg shadow-emerald-500/10'
                : 'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100',
            ].join(' ')}>
            <div className="flex items-center justify-between mb-2">
              <Zap
                className={[
                  'w-5 h-5',
                  serviceType === 'dedicated'
                    ? 'text-emerald-400'
                    : 'text-slate-400',
                ].join(' ')}/>
              {serviceType === 'dedicated' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
            </div>

            <div>
              <h6 className="text-xs font-bold text-white">
                Internet Dedicado
              </h6>
              <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                Enlace corporativo. Suma a matrices de Internet.
              </p>
            </div>
          </button>

          {/* TRANSPORTE */}
          <button
            type="button"
            onClick={() => handleServiceChange('transport')}
            className={[
              'p-4 rounded-2xl border cursor-pointer transition-all',
              'flex flex-col justify-between text-left',
              serviceType === 'transport'
                ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500 shadow-lg shadow-amber-500/10'
                : 'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100',
            ].join(' ')}>
            <div className="flex items-center justify-between mb-2">
              <Network
                className={[
                  'w-5 h-5',
                  serviceType === 'transport'
                    ? 'text-amber-400'
                    : 'text-slate-400',
                ].join(' ')}/>
              {serviceType === 'transport' && (
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
              )}
            </div>

            <div>
              <h6 className="text-xs font-bold text-white">
                Transporte de Datos
              </h6>
              <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                Circuito L2. Se separa del universo de Internet.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* DATOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800">
        {/* COLUMNA IZQUIERDA */}
        <div className="space-y-4">
          {/* ORDEN */}
          <div className="space-y-1">
            <label className={modalLabelClass}>
              ID de Orden / Suscripción
            </label>

            <input
              type="text"
              required
              className={modalInputClass}
              value={value.orden}
              onChange={(event) =>
                onChange({
                  orden: event.target.value,
                })
              }/>
          </div>

          {/* CLIENTE */}
          <div className="space-y-1">
            <label className={modalLabelClass}>
              Nombre del Cliente
            </label>

            <input
              type="text"
              className={modalInputClass}
              value={value.cliente ?? ''}
              onChange={(event) =>
                onChange({
                  cliente: event.target.value,
                })
              }/>
          </div>

          {/* PLAN */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={modalLabelClass}>
                Plan / Producto
              </label>

              <button
                type="button"
                onClick={() => onCustomChange(!custom)}
                className="text-[10px] text-brand hover:underline font-semibold flex items-center gap-1">
                <PenLine className="w-3 h-3" />

                {custom
                  ? 'Seleccionar plan'
                  : 'Escribir manual'}
              </button>
            </div>

            {!custom ? (
              <select
                className={modalInputClass}
                value={value.producto ?? ''}
                onChange={(event) =>
                  onPlanChange(event.target.value)
                }>
                <option value="">
                  -- Selecciona un plan de Planes.json --
                </option>

                {plans.map((plan) => {
                  const planName =
                    plan.name ?? plan.plan_name;

                  return (
                    <option
                      key={planName}
                      value={planName}>
                      {planName}
                    </option>
                  );
                })}

                <option value="__CUSTOM__">
                  ➕ Otro / Escribir producto personalizado...
                </option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  className={modalInputClass}
                  value={value.producto ?? ''}
                  onChange={(event) =>
                    onChange({
                      producto: event.target.value,
                    })
                  }
                />

                <button
                  type="button"
                  onClick={() => onCustomChange(false)}
                  className="px-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                  title="Volver al catálogo">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div className="space-y-4">
          {/* TECNOLOGÍA + PERSONA */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={modalLabelClass}>
                Tecnología
              </label>

              <select
                className={modalInputClass}
                value={value.tecnologia ?? 'FTTH'}
                onChange={(event) =>
                  onChange({
                    tecnologia: event.target.value,
                  })
                }
              >
                <option value="FTTH">
                  Alámbrico
                </option>

                <option value="RF">
                  Inalámbrico
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label className={modalLabelClass}>
                Tipo Persona
              </label>

              <select
                className={modalInputClass}
                value={value.tipo_persona ?? 'pyme'}
                onChange={(event) =>
                  onChange({
                    tipo_persona: event.target.value,
                  })
                }
              >
                <option value="pyme">
                  Jurídica
                </option>

                <option value="nat">
                  Natural
                </option>
              </select>
            </div>
          </div>

          {/* VELOCIDAD */}
          <div className="space-y-1">
            <label className={modalLabelClass}>
              Velocidad Asignada (Mbps)
            </label>

            <input
              type="number"
              min="0"
              className={modalInputClass}
              value={value.datas_mbps ?? 0}
              onChange={(event) =>
                onChange({
                  datas_mbps: Number(event.target.value),
                })
              }
            />
          </div>

          {/* TV */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => onChange({tiene_tv : !value.tiene_tv})}
              className={[
                'w-full p-4 rounded-2xl border cursor-pointer transition-all',
                'flex flex-col justify-between text-left',
                value.tiene_tv == true
                  ? 'bg-sky-500/15 border-sky-500 ring-1 ring-sky-500 shadow-lg shadow-sky-500/10'
                  : 'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100',
              ].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <Tv2
                  className={[
                    'w-5 h-5',
                    value.tiene_tv == true
                      ? 'text-sky-500'
                      : 'text-slate-400',
                  ].join(' ')}/>
                {value.tiene_tv == true && (
                  <CheckCircle2 className="w-4 h-4 text-sky-500" />
                )}
              </div>
              <div>
                <h6 className="text-xs font-bold text-white">
                  IPTV
                </h6>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                  El suscriptor tiene un plan con tv rastreable para la declaracion
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest"
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={saving}
          className="bg-brand hover:bg-brand-hover text-white px-8 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-brand/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />

          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  );
}

export function PlanForm({
  value,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  value: EtaPlanConfig;
  saving: boolean;
  onChange: (patch: Partial<EtaPlanConfig>) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Nombre del plan</label>
          <input className={inputClass} value={value.plan_name} onChange={(e) => onChange({ plan_name: e.target.value, name: e.target.value })} required />
        </div>
        <div>
          <label className={labelClass}>Tecnología</label>
          <select className={inputClass} value={value.tecnologia ?? 'FTTH'} onChange={(e) => onChange({ tecnologia: e.target.value })}>
            {['FTTH', 'HFC', 'ADSL', 'Dedicado', 'Transporte'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Tipo de persona</label>
          <select className={inputClass} value={value.tipo_persona ?? 'pyme'} onChange={(e) => onChange({ tipo_persona: e.target.value })}>
            {['nat', 'pyme', 'corporativo'].map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Mbps</label>
          <input className={inputClass} type="number" min="0" value={value.datas_mbps ?? 0} onChange={(e) => onChange({ datas_mbps: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          ['tiene_tv', 'Tiene TV', value.tiene_tv],
          ['es_transporte', 'Transporte', value.es_transporte],
          ['es_dedicado', 'Dedicado', value.es_dedicado],
        ].map(([key, text, checked]) => (
          <label key={String(key)} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3 text-xs font-bold text-slate-300 cursor-pointer">
            <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange({ [String(key)]: e.target.checked })} />
            {text}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-black uppercase text-slate-400">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase text-white disabled:opacity-50"><Save className="mr-2 inline w-4 h-4" />Guardar plan</button>
      </div>
    </form>
  );
}