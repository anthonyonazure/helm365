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
import { Loader2 } from 'lucide-react';

// Register all AI providers
import './providers';

export default function App() {
  const { user, initialized, initialize } = useAuth();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Loading state while checking auth
  if (!initialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-helm-500" />
      </div>
    );
  }

  // Not logged in — show login
  if (!user) {
    return <LoginView />;
  }

  // Logged in — show app
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
