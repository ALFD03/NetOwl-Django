/** Los formularios de alta que abre Notificaciones: nombre ignorado, plan, zona y persona de ventas. */

import { BookMarked, Briefcase, EyeOff, Network } from 'lucide-react';

import { Modal } from '@/shared/ui';
import type { CatalogsNotificationsProps } from '@/features/subscriptions/types';
import { send, type CatalogsState } from './CatalogCommon';
import { PlanForm } from './ProductForms';
import { MembershipForm } from './SalesForms';
import { IgnoredForm, ZoneForm } from './StructureForms';

export function NotificationFormModals({
  c,
  areas,
  options,
}: {
  c: CatalogsState;
  areas: CatalogsNotificationsProps['areas'];
  options: CatalogsNotificationsProps['options'];
}) {
  return (
    <>
      <Modal
        isOpen={Boolean(c.ignoredDraft)}
        onClose={c.closeForms}
        title="Nombre ignorado"
        subtitle="Un nombre de los datos que no se registrará y no debe aparecer como pendiente"
        icon={<EyeOff className="h-5 w-5 text-slate-300" />}
        theme="slate"
        size="md"
      >
        {c.ignoredDraft && (
          <IgnoredForm
            value={c.ignoredDraft}
            areas={areas}
            saving={c.saving}
            onChange={(patch) => c.setIgnoredDraft({ ...c.ignoredDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('ignorados', { ...c.ignoredDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.planDraft)}
        onClose={c.closeForms}
        title="Nuevo plan del catálogo"
        subtitle="Única clasificación del producto: de aquí la leen los análisis y el reporte ETA"
        icon={<BookMarked className="h-5 w-5 text-purple-400" />}
        theme="purple"
      >
        {c.planDraft && (
          <PlanForm
            value={c.planDraft}
            technologies={options.technologies}
            personTypes={options.personTypes}
            regulators={options.regulators}
            saving={c.saving}
            onChange={(patch) => c.setPlanDraft({ ...c.planDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('planes', { ...c.planDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.zoneDraft)}
        onClose={c.closeForms}
        title="Nueva zona"
        subtitle="Nodo de red: site, estado y coordinador por los que se agrupa"
        icon={<Network className="h-5 w-5 text-sky-400" />}
        theme="blue"
      >
        {c.zoneDraft && (
          <ZoneForm
            value={c.zoneDraft}
            sites={options.sites}
            states={options.states}
            coordinators={options.coordinators}
            technologies={options.technologies}
            saving={c.saving}
            onChange={(patch) => c.setZoneDraft({ ...c.zoneDraft!, ...patch })}
            onSubmit={(e) => send(e, () => c.save('zonas', { ...c.zoneDraft }))}
            onClose={c.closeForms}
          />
        )}
      </Modal>

      <Modal
        isOpen={Boolean(c.personDraft)}
        onClose={c.closeForms}
        title="Registrar persona de ventas"
        subtitle="Cómo aparece en las suscripciones: es contra esto que Comisiones reparte cada venta"
        icon={<Briefcase className="h-5 w-5 text-emerald-400" />}
        theme="green"
      >
        {c.personDraft &&
          (() => {
            const team = options.teams.find((e) => e.slug === c.personDraft!.equipo);
            const role = team?.roles.find((r) => r.role === c.personDraft!.role);
            return team && role ? (
              <MembershipForm
                value={c.personDraft}
                teams={options.teams}
                team={team}
                role={role}
                people={options.people}
                memberships={options.memberships}
                sites={options.sites}
                units={options.coordinators}
                saving={c.saving}
                onChange={(patch) => c.setPersonDraft({ ...c.personDraft!, ...patch })}
                onSubmit={(e) => send(e, () => c.save('membresias', { ...c.personDraft }))}
                onClose={c.closeForms}
              />
            ) : null;
          })()}
      </Modal>
    </>
  );
}
