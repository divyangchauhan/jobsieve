import { createRoot } from 'react-dom/client';
import { Providers } from '../../app/providers';
import { Layout } from '../../ui/components/Layout';
import { JobBoard } from '../../ui/pages/JobBoard';
import { JobDetail } from '../../ui/pages/JobDetail';
import { Settings } from '../../ui/pages/Settings';
import { Alerts } from '../../ui/pages/Alerts';
import '../../app/globals.css';
const path = window.location.pathname;
createRoot(document.getElementById('root')!).render(
  <Providers>
    <Layout>
      {path === '/settings' ? (
        <Settings />
      ) : path === '/alerts' ? (
        <Alerts />
      ) : path.startsWith('/jobs/') ? (
        <JobDetail />
      ) : (
        <JobBoard />
      )}
    </Layout>
  </Providers>,
);
