import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './ui/layout/AppLayout';
import { DashboardView } from './ui/views/DashboardView';
import { SettingsView } from './ui/views/SettingsView';

// Register all AI providers
import './providers';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}
