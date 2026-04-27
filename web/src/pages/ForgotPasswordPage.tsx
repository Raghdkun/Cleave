import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Check, Github } from 'lucide-react';
import { useState } from 'react';
import { GlassCard } from '../components/GlassCard';
import { useRouter } from '../router';
import { useAuth } from '../auth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { navigate } = useRouter();
  const { signInWithGitHub } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // UI-only for now
    setSubmitted(true);
  };

  return (
    <div className="w-full px-4 py-16 md:py-20 flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <button
          onClick={() => navigate('auth')}
          className="text-sm text-white/40 hover:text-white/70 mb-6 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent mb-2">
            Reset your password
          </h1>
          <p className="text-sm text-white/40">
            Enter the email associated with your account and we'll send you a link to reset it.
          </p>
        </div>

        <GlassCard className="p-6 md:p-8">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                <Check className="w-7 h-7 text-emerald-300" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">Check your inbox</h2>
              <p className="text-sm text-white/50 mb-6">
                If an account exists for <span className="text-white">{email}</span>, you'll get a
                reset link shortly.
              </p>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setEmail('');
                }}
                className="text-sm text-violet-300 hover:text-violet-200 cursor-pointer"
              >
                Try another email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 transition-all"
                />
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-md shadow-violet-500/20 cursor-pointer"
              >
                Send reset link
              </motion.button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[11px] uppercase tracking-wider text-white/30">or</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              <button
                type="button"
                onClick={signInWithGitHub}
                className="w-full py-3 rounded-xl font-medium bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-white text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Github className="w-4 h-4" />
                Sign in with GitHub instead
              </button>
            </form>
          )}
        </GlassCard>

        <p className="text-center text-[11px] text-white/25 mt-6">
          Trouble accessing your account?{' '}
          <a href="mailto:support@raghdkun.tech" className="text-violet-300 hover:text-violet-200">
            Contact support
          </a>
        </p>
      </motion.div>
    </div>
  );
}
