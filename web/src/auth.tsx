import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthPlan {
  id: string;
  slug: string;
  name: string;
  allowReact: boolean;
  allowApi: boolean;
  maxExportsPerMonth: number;
  maxPagesPerCrawl: number;
  seats: number;
}

export interface AuthUser {
  id: string;
  githubId: string | null;
  login: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  planId: string | null;
  plan?: AuthPlan | null;
  subscriptionStatus?: 'NONE' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGitHub: () => void;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name?: string) => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
  signInWithGitHub: () => {},
  signInWithEmail: async () => {},
  registerWithEmail: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    window.location.href = '/';
  };

  const signInWithGitHub = () => {
    window.location.href = '/api/auth/github';
  };

  const signInWithEmail = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Sign in failed');
    await refresh();
  };

  const registerWithEmail = async (email: string, password: string, name?: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Registration failed');
    await refresh();
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Ctx.Provider
      value={{ user, loading, refresh, signOut, signInWithGitHub, signInWithEmail, registerWithEmail }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
