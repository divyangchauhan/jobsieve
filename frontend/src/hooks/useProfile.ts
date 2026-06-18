import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { getProfile, getProfileOptions, updateProfile } from '../api/profile';

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: getProfile });
}

export function useProfileOptions() {
  return useQuery({
    queryKey: ['profile-options'],
    queryFn: getProfileOptions,
    staleTime: Infinity,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (saved) => {
      queryClient.setQueryData(['profile'], saved);
      // Re-rank the jobs list immediately against the new profile.
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Profile saved — jobs re-ranked');
    },
    onError: () => {
      toast.error('Failed to save profile');
    },
  });
}
