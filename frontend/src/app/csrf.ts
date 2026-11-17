/**
 * Prepara la instancia **global** de axios, que es la que usa Inertia.
 *
 * `apiClient` recibe el mismo tratamiento en `shared/lib/api/client.ts`.
 */

import axios from 'axios';

import { applyCsrf } from '../shared/lib/http/csrf';

// Inertia hace sus peticiones con la instancia global de axios, asi que es esa
// la que hay que preparar. `apiClient` recibe el mismo tratamiento en
// shared/lib/api/client.ts.
export default applyCsrf(axios);
