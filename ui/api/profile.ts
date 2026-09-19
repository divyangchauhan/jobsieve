import { apiClient } from './client';
import type { Profile, ProfileOptions } from '../types/profile';

export async function getProfile(): Promise<Profile> {
  const { data } = await apiClient.get<Profile>('/profile');
  return data;
}

export async function getProfileOptions(): Promise<ProfileOptions> {
  const { data } = await apiClient.get<ProfileOptions>('/profile/options');
  return data;
}

export async function updateProfile(profile: Profile): Promise<Profile> {
  const { data } = await apiClient.put<Profile>('/profile', profile);
  return data;
}
