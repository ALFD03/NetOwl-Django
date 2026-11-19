/**
 * Página `/encuestas/configuracion/`.
 *
 * Las preguntas y opciones de las dos encuestas.
 */

import { SettingsView, type SurveySettingsProps } from '@/features/surveys';

export default function SurveySettings(props: SurveySettingsProps) {
  return <SettingsView {...props} />;
}
