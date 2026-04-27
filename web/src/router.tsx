import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Route = 'home' | 'plans' | 'auth' | 'projects' | 'forgot' | 'dashboard' | 'profile' | 'billing';

interface RouterCtx {
  route: Route;
  navigate: (r: Route) => void;
}

const Ctx = createContext<RouterCtx>({ route: 'home', navigate: () => {} });

const PATHS: Record<Route, string> = {
  home: '/',
  plans: '/plans',
  auth: '/auth',
  projects: '/projects',
  forgot: '/forgot-password',
  dashboard: '/dashboard',
  profile: '/profile',
  billing: '/billing',
};

function pathToRoute(pathname: string): Route {
  if (pathname.startsWith('/plans')) return 'plans';
  if (pathname.startsWith('/auth')) return 'auth';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/forgot')) return 'forgot';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/billing')) return 'billing';
  return 'home';
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === 'undefined' ? 'home' : pathToRoute(window.location.pathname),
  );

  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (r: Route) => {
    if (r === route) return;
    window.history.pushState({}, '', PATHS[r]);
    setRoute(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return <Ctx.Provider value={{ route, navigate }}>{children}</Ctx.Provider>;
}

export function useRouter() {
  return useContext(Ctx);
}
