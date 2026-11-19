/**
 * Páginas `/encuestas/instalados/` y `/encuestas/bajas/`.
 *
 * La lista de clientes del mes cerrado, su formulario y los resultados.
 */

import { SurveyView, type SurveyPageProps } from '@/features/surveys';

export default function Survey(props: SurveyPageProps) {
  return <SurveyView {...props} />;
}
