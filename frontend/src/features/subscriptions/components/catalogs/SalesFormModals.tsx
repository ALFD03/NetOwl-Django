/** Los formularios de Catálogos › Ventas: persona, condiciones, objetivos, semáforo, unidad y site. */

import { Banknote, Briefcase, Building, Crown, MapPin, Target, TrafficCone } from 'lucide-react';

import { Modal } from '@/shared/ui';
import type { CatalogSalesPerson, CatalogsSalesProps } from '@/features/subscriptions/types';
import { send, type CatalogsState } from './CatalogCommon';
import { ConditionsForm } from './RoleConditions';
import { OfficeTargetForm } from './OfficeTargetForm';
import { MembershipForm, SiteForm, UnitForm } from './SalesForms';
import { TargetForm, MonthTargetForm, TrafficLightForm } from './TargetForms';
import { overallTarget } from '../../lib/targets';

type Team = CatalogsSalesProps['teams'][number];

export function SalesFormModals({
  c,
  props,
  teamDraft,
  roleDraft,
  officeCoordinators,
  overallToday,
  overallWithoutException,
  catalogNodes,
}: {
  c: CatalogsState;
  props: CatalogsSalesProps;
  /** El equipo y el rol de la persona en edición. */
  teamDraft: Team | undefined;
  roleDraft: Team['roles'][number] | undefined;
  officeCoordinators: CatalogSalesPerson[];
  /** El objetivo general de hoy y, por mes, el que rige sin la excepción del mes. */
  overallToday: ReturnType<typeof overallTarget>;
  overallWithoutException: (period: string) => ReturnType<typeof overallTarget>;
  /** Los nodos conocidos que tienen zona en el catálogo. */
  catalogNodes: CatalogsSalesProps['knownNodes'];
}) {
  const { teams, people, memberships, sites, coordinators, zones, states, computedPeriods } = props;
  return (
    <>
      <Modal
        isOpen={Boolean(c.personDraft && teamDraft && roleDraft)}
        onClose={c.closeForms}
        title={c.personDraft?.id ? 'Editar persona del equipo' : 'Registrar persona en el equipo'}
        subtitle="Cómo aparece en las suscripciones: es contra esto que Comisiones reparte cada venta"
        icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.personDraft && teamDraft && roleDraft && (
          <MembershipForm
            value={c.personDraft}
            teams={teams}
            team={teamDraft}
            role={roleDraft}
            people={people}
            memberships={memberships}
            sites={sites}
            units={coordinators}
            saving={c.saving}
            onChange={(patch) => c.setPersonDraft({ ...c.personDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('membresias', { ...c.personDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.conditionDraft)}
        onClose={c.closeForms}
        title="Condiciones de pago"
        subtitle="Solo afecta a lo que se calcule después"
        icon={<Banknote className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.conditionDraft && (
          <ConditionsForm
            value={c.conditionDraft}
            saving={c.saving}
            onChange={(patch) => c.setConditionDraft({ ...c.conditionDraft!, ...patch })}
            onSubmit={(e) =>
              send(e, () =>
                c.save('condiciones_equipo', {
                  team_id: c.conditionDraft!.team_id,
                  role: c.conditionDraft!.role,
                  params: c.conditionDraft!.params,
                }),
              )
            }
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.officeTargetDraft)}
        onClose={c.closeForms}
        title={c.officeTargetDraft?.id ? 'Editar objetivo de ventas' : 'Nuevo objetivo de ventas'}
        subtitle="Cuántas ventas al mes se esperan de una coordinadora de oficina"
        icon={<Building className="h-5 w-5 text-purple-400" />}
        theme="purple"
        size="md"
      >
        {c.officeTargetDraft && (
          <OfficeTargetForm
            value={c.officeTargetDraft}
            coordinatorOffices={officeCoordinators}
            saving={c.saving}
            onChange={(patch) => c.setOfficeTargetDraft({ ...c.officeTargetDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('objetivos_oficina', { ...c.officeTargetDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.unitDraft)}
        onClose={c.closeForms}
        title={c.unitDraft?.id ? 'Editar unidad de negocio' : 'Nueva unidad de negocio'}
        subtitle="Un conjunto de zonas y los equipos de ventas que lo trabajan"
        icon={<Crown className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.unitDraft && (
          <UnitForm
            value={c.unitDraft}
            zones={zones}
            teams={teams}
            saving={c.saving}
            onChange={(patch) => c.setUnitDraft({ ...c.unitDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('coordinadores', { ...c.unitDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.siteDraft)}
        onClose={c.closeForms}
        title={c.siteDraft?.id ? 'Editar site' : 'Nuevo site'}
        subtitle="Sede regional, sus zonas y los equipos que la trabajan"
        icon={<MapPin className="h-5 w-5 text-slate-300" />}
        theme="slate"
      >
        {c.siteDraft && (
          <SiteForm
            value={c.siteDraft}
            zones={zones}
            teams={teams}
            saving={c.saving}
            onChange={(patch) => c.setSiteDraft({ ...c.siteDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('sites', { ...c.siteDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.targetDraft)}
        onClose={c.closeForms}
        title={c.targetDraft?.id ? 'Editar objetivo' : 'Nuevo objetivo'}
        subtitle="Meta de crecimiento y churn máximo. No cambia ningún análisis: solo metas, cumplimiento y colores"
        icon={<Target className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.targetDraft && (
          <TargetForm
            value={c.targetDraft}
            entities={{ zona: zones, site: sites, estado: states, coordinador: coordinators }}
            nodes={catalogNodes}
            general={overallToday}
            saving={c.saving}
            onChange={(patch) => c.setTargetDraft({ ...c.targetDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('objetivos', { ...c.targetDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.monthTargetDraft)}
        onClose={c.closeForms}
        title={c.monthTargetDraft?.id ? 'Editar excepción del mes' : 'Excepción de un mes'}
        subtitle="Sustituye al objetivo general solo en ese mes"
        icon={<Target className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="md"
      >
        {c.monthTargetDraft && (
          <MonthTargetForm
            value={c.monthTargetDraft}
            periods={computedPeriods}
            general={overallWithoutException(c.monthTargetDraft.period)}
            saving={c.saving}
            onChange={(patch) => c.setMonthTargetDraft({ ...c.monthTargetDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('objetivos_mes', { ...c.monthTargetDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.trafficLightDraft)}
        onClose={c.closeForms}
        title="Semáforo de objetivos"
        subtitle="Desde dónde es verde, amarillo o rojo cada métrica, igual en todo el módulo"
        icon={<TrafficCone className="h-5 w-5 text-amber-400" />}
        theme="yellow"
      >
        {c.trafficLightDraft && (
          <TrafficLightForm
            value={c.trafficLightDraft}
            saving={c.saving}
            onChange={(patch) => c.setTrafficLightDraft({ ...c.trafficLightDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('semaforo', { ...c.trafficLightDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>
    </>
  );
}
