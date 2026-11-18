/** Endpoints de administración de usuarios, grupos y permisos. */

import { apiClient } from './client';
import type { ApiMessageResponse } from './types';
import type { UnitsSelection } from '@/shared/types/auth';

export interface CreateUserRequest { username: string; password: string; role: string; group_id: number | string | null; permissions: Record<string, boolean>; unidades: UnitsSelection; }
export interface UpdateUserPermissionsRequest { user_id: number; role: string; group_id: number | null; permissions: Record<string, boolean>; unidades: UnitsSelection; }
export interface ChangePasswordRequest { user_id: number; password: string; }
export interface SaveGroupRequest { group_id: number | null; name: string; description: string; permissions: Record<string, boolean>; }

const json = <T>(promise: Promise<{ data: T }>) => promise.then((r) => r.data);

export const configApi = {
  createUser: ({ group_id, ...request }: CreateUserRequest) =>
    json(apiClient.post<ApiMessageResponse>('/api/auth/users/', { ...request, group_id: group_id ? Number(group_id) : null })),
  updateUserPermissions: ({ user_id, ...request }: UpdateUserPermissionsRequest) =>
    json(apiClient.post<ApiMessageResponse>(`/api/auth/users/${user_id}/permissions/`, request)),
  changePassword: ({ user_id, password }: ChangePasswordRequest) =>
    json(apiClient.post<ApiMessageResponse>(`/api/auth/users/${user_id}/password/`, { password })),
  saveGroup: ({ group_id, ...request }: SaveGroupRequest) =>
    json(apiClient.post<ApiMessageResponse>(group_id ? `/api/auth/groups/${group_id}/` : '/api/auth/groups/', request)),
  deleteUser: (user_id: number) => json(apiClient.delete<ApiMessageResponse>(`/api/auth/users/${user_id}/`)),
  deleteGroup: (group_id: number) => json(apiClient.delete<ApiMessageResponse>(`/api/auth/groups/${group_id}/`)),
};
