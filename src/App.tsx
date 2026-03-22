import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './ui/layout/AppLayout';
import { DashboardView } from './ui/views/DashboardView';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardView />} />
      </Route>
    </Routes>
  );
}
