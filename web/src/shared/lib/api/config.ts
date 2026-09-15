/** Endpoints de administración de usuarios, grupos y permisos. */

import { apiClient } from './client';
import type { ApiMessageResponse } from './types';

export interface CreateUserRequest { username: string; password: string; role: string; group_id: number | string | null; permissions: Record<string, boolean>; }
export interface UpdateUserPermissionsRequest { user_id: number; role: string; group_id: number | null; permissions: Record<string, boolean>; }
export interface ChangePasswordRequest { user_id: number; password: string; }
export interface SaveGroupRequest { group_id: number | null; name: string; description: string; permissions: Record<string, boolean>; }

export const configApi = {
  createUser: async (request: CreateUserRequest) => (await apiClient.post<ApiMessageResponse>('/auth/api/users/create/', request)).data,
  updateUserPermissions: async (request: UpdateUserPermissionsRequest) => (await apiClient.post<ApiMessageResponse>('/auth/api/users/update-permissions/', request)).data,
  changePassword: async (request: ChangePasswordRequest) => (await apiClient.post<ApiMessageResponse>('/auth/api/users/change-password/', request)).data,
  saveGroup: async (request: SaveGroupRequest) => (await apiClient.post<ApiMessageResponse>('/auth/api/groups/save/', request)).data,
  deleteUser: async (user_id: number) => (await apiClient.post<ApiMessageResponse>('/auth/api/users/delete/', { user_id })).data,
  deleteGroup: async (group_id: number) => (await apiClient.post<ApiMessageResponse>('/auth/api/groups/delete/', { group_id })).data,
};
