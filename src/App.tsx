import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './ui/layout/AppLayout';
import { DashboardView } from './ui/views/DashboardView';
import { ActionFeedView } from './ui/views/ActionFeedView';
import { OperationsCenterView } from './ui/views/OperationsCenterView';
import { TenantsView } from './ui/views/TenantsView';
import { SettingsView } from './ui/views/SettingsView';

// Register all AI providers
import './providers';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardView />} />
        <Route path="/feed" element={<ActionFeedView />} />
        <Route path="/operations" element={<OperationsCenterView />} />
        <Route path="/tenants" element={<TenantsView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}
