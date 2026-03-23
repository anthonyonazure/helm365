import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './ui/layout/AppLayout';
import { DashboardView } from './ui/views/DashboardView';
import { AIChatView } from './ui/views/AIChatView';
import { ActionFeedView } from './ui/views/ActionFeedView';
import { OperationsCenterView } from './ui/views/OperationsCenterView';
import { TenantsView } from './ui/views/TenantsView';
import { SettingsView } from './ui/views/SettingsView';
import { LoginView } from './ui/views/LoginView';
import { useAuth } from './lib/auth';
import { useHelmStore } from './lib/store';
import { useTenantsStore } from './lib/tenants-store';
import { Loader2 } from 'lucide-react';

// Register all AI providers
import './providers';

export default function App() {
  const { user, teamId, initialized, initialize } = useAuth();
  const loadProviders = useHelmStore((s) => s.loadProvidersFromDb);
  const loadTenants = useTenantsStore((s) => s.loadFromDb);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Load data from Supabase when team is available
  useEffect(() => {
    if (teamId) {
      loadProviders(teamId);
      loadTenants(teamId);
    }
  }, [teamId, loadProviders, loadTenants]);

  if (!initialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-helm-500" />
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardView />} />
        <Route path="/chat" element={<AIChatView />} />
        <Route path="/feed" element={<ActionFeedView />} />
        <Route path="/operations" element={<OperationsCenterView />} />
        <Route path="/tenants" element={<TenantsView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}
