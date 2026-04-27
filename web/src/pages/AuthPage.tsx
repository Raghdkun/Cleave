import { motion } from 'framer-motion';
import { Github, AlertCircle, Mail, Lock, User as UserIcon, Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { GlassCard } from '../components/GlassCard';
import { useRouter } from '../router';
import { useAuth } from '../auth';

const ERROR_MESSAGES: Record<string, string> = {
  oauth_state: 'Sign-in was interrupted. Please try again.',
  oauth_token: 'GitHub did not return an access token. Please try again.',
  oauth_failed: 'Something went wrong while signing you in.',
};

type Mode = 'signin' | 'register';

export function AuthPage() {
  const { signInWithGitHub, signInWithEmail, registerWithEmail, refresh } = useAuth();
  const { navigate } = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get('error');
    if (e) setError(ERROR_MESSAGES[e] ?? 'Sign-in failed.');
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, name || undefined);
      }
      await refresh();
      navigate('home');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full px-4 py-16 md:py-20 flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent mb-2">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-white/40">
            {mode === 'signin'
              ? 'Sign in to manage your exports.'
              : 'Start exporting websites in seconds.'}
          </p>
        </div>

        <GlassCard className="p-6 md:p-8">
          {/* Mode toggle */}
          <div className="flex p-1 mb-5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {(['signin', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`relative flex-1 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                  mode === m ? 'text-white' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {mode === m && (
                  <motion.span
                    layoutId="auth-tab"
                    className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-violet-600/80 to-cyan-500/80"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                {m === 'signin' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-sm text-red-200">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-300" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === 'register' && (
              <Field icon={UserIcon} type="text" placeholder="Your name (optional)" value={name} onChange={setName} />
            )}
            <Field icon={Mail} type="email" placeholder="you@example.com" value={email} onChange={setEmail} required />
            <Field
              icon={Lock}
              type="password"
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Password'}
              value={password}
              onChange={setPassword}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
            <motion.button
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-md shadow-violet-500/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </motion.button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-white/30">
            <div className="flex-1 h-px bg-white/[0.06]" />
            or
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <button
            type="button"
            onClick={signInWithGitHub}
            className="w-full py-3 rounded-xl font-medium bg-[#1a1a23] hover:bg-[#23232e] border border-white/[0.1] text-white text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Github className="w-4 h-4" />
            Continue with GitHub
          </button>

          {mode === 'signin' && (
            <div className="mt-5 text-center text-xs">
              <button
                onClick={() => navigate('forgot')}
                className="text-white/40 hover:text-white/70 transition-colors cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
          )}
        </GlassCard>

        <p className="text-center text-[11px] text-white/25 mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}

function Field({
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
  required,
  minLength,
}: {
  icon: React.ComponentType<{ className?: string }>;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className="w-full pl-10 pr-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 transition-all"
      />
    </div>
  );
}
