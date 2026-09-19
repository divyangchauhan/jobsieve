import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
});
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      typeof error.response?.data?.error === 'string'
    ) {
      error.message = error.response.data.error;
    }
    return Promise.reject(error);
  },
);
