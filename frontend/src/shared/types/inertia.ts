import type { PageProps } from '@inertiajs/core';
import type { AuthProps } from './auth';

/** Props shared by every Inertia page, including public pages. */
export interface AppPageProps extends PageProps {
  auth?: AuthProps;
}

/** Props for pages that are guaranteed to run inside an authenticated session. */
export interface AuthenticatedPageProps extends PageProps {
  auth: AuthProps;
}
