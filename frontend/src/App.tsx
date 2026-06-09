import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { JobBoard } from './pages/JobBoard';
import { JobDetail } from './pages/JobDetail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="bottom-right" />
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<JobBoard />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
