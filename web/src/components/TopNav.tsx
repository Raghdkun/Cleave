import { motion } from 'framer-motion';
import { Menu, X, LogOut, LayoutDashboard, User as UserIcon, CreditCard } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter, type Route } from '../router';
import { useAuth } from '../auth';

const NAV_ITEMS: { label: string; route: Route }[] = [
  { label: 'Export', route: 'home' },
  { label: 'Recent', route: 'projects' },
  { label: 'Plans', route: 'plans' },
];

export function TopNav() {
  const { route, navigate } = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-30 px-4 py-3 backdrop-blur-xl bg-[#0a0a14]/60 border-b border-white/[0.05]"
    >
      <nav className="max-w-6xl mx-auto flex items-center justify-between">
        <button
          onClick={() => navigate('home')}
          className="flex items-center gap-2 group cursor-pointer"
          aria-label="Go to home"
        >
          <img
            src="/logo.svg"
            alt=""
            className="w-8 h-8 rounded-lg shadow-lg shadow-violet-500/20 group-hover:shadow-violet-500/40 transition-shadow"
            draggable={false}
          />
          <span className="text-base font-bold bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent">
            Cleave
          </span>
        </button>

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.route === route;
            return (
              <li key={item.route}>
                <button
                  onClick={() => navigate(item.route)}
                  className={`relative px-4 py-2 text-sm rounded-lg transition-all cursor-pointer ${
                    active
                      ? 'text-white'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <motion.div
                      layoutId="nav-underline"
                      className="absolute inset-0 -z-10 rounded-lg bg-white/[0.06] border border-white/[0.08]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-all cursor-pointer"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.login}
                    className="w-7 h-7 rounded-full"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400" />
                )}
                <span className="text-sm text-white/80 max-w-[120px] truncate">
                  {user.name || user.login}
                </span>
              </button>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 mt-2 w-52 rounded-xl bg-[#12121d]/95 backdrop-blur-xl border border-white/[0.08] shadow-xl py-1 z-40"
                >
                  <div className="px-3 py-2 border-b border-white/[0.05]">
                    <div className="text-sm text-white truncate">{user.name || user.login}</div>
                    <div className="text-xs text-white/40 truncate">@{user.login}</div>
                  </div>
                  {user.role === 'ADMIN' && (
                    <MenuItem
                      icon={LayoutDashboard}
                      label="Admin Dashboard"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('dashboard');
                      }}
                    />
                  )}
                  <MenuItem
                    icon={UserIcon}
                    label="Profile"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('profile');
                    }}
                  />
                  <MenuItem
                    icon={CreditCard}
                    label="Billing"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('billing');
                    }}
                  />
                  <MenuItem
                    icon={UserIcon}
                    label="Recent Projects"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('projects');
                    }}
                  />
                  <div className="h-px bg-white/[0.05] my-1" />
                  <MenuItem
                    icon={LogOut}
                    label="Sign out"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    danger
                  />
                </motion.div>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => navigate('auth')}
                className="text-sm text-white/60 hover:text-white px-3 py-2 rounded-lg transition-colors cursor-pointer"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate('auth')}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-md shadow-violet-500/20 transition-all cursor-pointer"
              >
                Get Started
              </button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden mt-3 px-2 pb-2 flex flex-col gap-1"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.route}
              onClick={() => {
                navigate(item.route);
                setOpen(false);
              }}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                item.route === route
                  ? 'bg-white/[0.06] text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="h-px my-2 bg-white/[0.06]" />
          {user ? (
            <>
              {user.role === 'ADMIN' && (
                <button
                  onClick={() => {
                    navigate('dashboard');
                    setOpen(false);
                  }}
                  className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white text-left cursor-pointer"
                >
                  Dashboard
                </button>
              )}
              <button
                onClick={() => {
                  navigate('profile');
                  setOpen(false);
                }}
                className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white text-left cursor-pointer"
              >
                Profile
              </button>
              <button
                onClick={() => {
                  navigate('billing');
                  setOpen(false);
                }}
                className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white text-left cursor-pointer"
              >
                Billing
              </button>
              <button
                onClick={() => {
                  signOut();
                  setOpen(false);
                }}
                className="px-3 py-2 rounded-lg text-sm text-red-300 text-left cursor-pointer"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  navigate('auth');
                  setOpen(false);
                }}
                className="px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white text-left cursor-pointer"
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  navigate('auth');
                  setOpen(false);
                }}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white text-left cursor-pointer"
              >
                Get Started
              </button>
            </>
          )}
        </motion.div>
      )}
    </motion.header>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer ${
        danger ? 'text-red-300 hover:bg-red-500/10' : 'text-white/70 hover:text-white hover:bg-white/[0.04]'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
