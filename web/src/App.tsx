import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { TopNav } from './components/TopNav';
import { Footer } from './components/Footer';
import { FeedbackProvider } from './components/FeedbackProvider';
import { HomePage } from './pages/HomePage';
import { PlansPage } from './pages/PlansPage';
import { AuthPage } from './pages/AuthPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { RecentProjectsPage } from './pages/RecentProjectsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { BillingPage } from './pages/BillingPage';
import { RouterProvider, useRouter, type Route } from './router';
import { AuthProvider, useAuth } from './auth';

const PROTECTED: Route[] = ['profile', 'billing', 'projects', 'dashboard'];
const PUBLIC_ONLY: Route[] = ['auth', 'forgot'];
const ADMIN_ONLY: Route[] = ['dashboard'];

function Routes() {
  const { route, navigate } = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (PROTECTED.includes(route) && !user) {
      navigate('auth');
      return;
    }
    if (PUBLIC_ONLY.includes(route) && user) {
      navigate('home');
      return;
    }
    if (ADMIN_ONLY.includes(route) && user && user.role !== 'ADMIN') {
      navigate('home');
    }
  }, [route, user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  // Avoid flashing protected content for one frame before the redirect lands.
  if (PROTECTED.includes(route) && !user) return null;
  if (PUBLIC_ONLY.includes(route) && user) return null;
  if (ADMIN_ONLY.includes(route) && user && user.role !== 'ADMIN') return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={route}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        {route === 'home' && <HomePage />}
        {route === 'plans' && <PlansPage />}
        {route === 'auth' && <AuthPage />}
        {route === 'forgot' && <ForgotPasswordPage />}
        {route === 'projects' && <RecentProjectsPage />}
        {route === 'dashboard' && <DashboardPage />}
        {route === 'profile' && <ProfilePage />}
        {route === 'billing' && <BillingPage />}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <FeedbackProvider>
          <div className="min-h-screen flex flex-col bg-[#0a0a14] text-white relative overflow-hidden">
            <AnimatedBackground />
            <TopNav />
            <main className="relative z-10 flex-1 flex flex-col pt-16">
              <Routes />
            </main>
            <Footer />
          </div>
        </FeedbackProvider>
      </RouterProvider>
    </AuthProvider>
  );
}
