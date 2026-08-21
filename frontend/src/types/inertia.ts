import type { PageProps } from '@inertiajs/core';
import type { AuthProps } from './auth';

export interface AppPageProps extends PageProps {
  auth: AuthProps;
}