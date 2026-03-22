import { Outlet } from 'react-router-dom';
import { CommandBar } from '../components/CommandBar';
import { Ship } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/' },
  { label: 'Action Feed', path: '/feed' },
  { label: 'Operations', path: '/operations' },
  { label: 'Tenants', path: '/tenants' },
  { label: 'Settings', path: '/settings' },
];

export function AppLayout() {
  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Header with Command Bar */}
      <header className="border-b px-4 py-2 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Ship className="h-6 w-6 text-helm-500" />
          <span className="font-bold text-lg">Helm365</span>
        </div>

        <div className="flex-1 max-w-2xl mx-auto">
          <CommandBar />
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.path}
              href={item.path}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
