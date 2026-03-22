import { useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { CommandBar } from '../components/CommandBar';
import { Ship, LayoutDashboard, Activity, Shield, HardDrive, Settings, Moon, Sun, Bell } from 'lucide-react';
import { useHelmStore } from '@/lib/store';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Feed', path: '/feed', icon: Activity },
  { label: 'Operations', path: '/operations', icon: Shield },
  { label: 'Tenants', path: '/tenants', icon: HardDrive },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export function AppLayout() {
  const pendingCount = useHelmStore((s) => s.pendingCount);
  const activeTenantName = useHelmStore((s) => s.activeTenantName);
  const location = useLocation();

  // Dark mode toggle
  const isDark = document.documentElement.classList.contains('dark');
  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('helm365-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  };

  // Load saved theme
  useEffect(() => {
    const saved = localStorage.getItem('helm365-theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Global Cmd+K to focus command bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('[data-command-input]');
        input?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b px-4 py-2 flex items-center gap-4 bg-card shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Ship className="h-5 w-5 text-helm-500" />
          <span className="font-bold text-base">Helm365</span>
        </div>

        {/* Command Bar */}
        <div className="flex-1 max-w-2xl mx-auto">
          <CommandBar />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Active tenant indicator */}
          {activeTenantName && (
            <span className="text-[10px] bg-helm-100 dark:bg-helm-900/30 text-helm-700 dark:text-helm-300 px-2 py-1 rounded font-medium mr-2">
              {activeTenantName}
            </span>
          )}

          {/* Pending count */}
          {pendingCount > 0 && (
            <NavLink
              to="/operations"
              className="relative p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-amber-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            </NavLink>
          )}

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar nav */}
        <nav className="w-14 border-r bg-card flex flex-col items-center py-2 gap-1 shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.label}
                className={`p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-helm-100 dark:bg-helm-900/30 text-helm-700 dark:text-helm-300'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon className="h-5 w-5" />
              </NavLink>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
