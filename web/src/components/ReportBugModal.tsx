import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, Lightbulb, MessageSquare, Loader2, X, Check } from 'lucide-react';
import { useAuth } from '../auth';

type Kind = 'BUG' | 'FEATURE' | 'GENERAL';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultKind?: Kind;
  source?: 'app' | 'download' | 'export';
}

const KINDS: { value: Kind; label: string; icon: typeof Bug; tint: string }[] = [
  { value: 'BUG', label: 'Bug', icon: Bug, tint: 'from-rose-400 to-pink-400' },
  { value: 'FEATURE', label: 'Feature', icon: Lightbulb, tint: 'from-amber-300 to-yellow-400' },
  { value: 'GENERAL', label: 'Feedback', icon: MessageSquare, tint: 'from-violet-300 to-cyan-300' },
];

export function ReportBugModal({ open, onClose, defaultKind = 'BUG', source = 'app' }: Props) {
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setSubject('');
      setMessage('');
      setEmail('');
      setDone(false);
      setError(null);
    }
  }, [open, defaultKind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          subject,
          message,
          email: email || undefined,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send report');
      setDone(true);
      setTimeout(() => onClose(), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-2xl backdrop-blur-xl"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-white/40 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Report a problem</h2>
              <p className="mt-1 text-sm text-white/50">
                Cleave is in beta — your reports directly shape the next release.
              </p>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="rounded-full bg-emerald-500/15 p-3">
                  <Check className="h-6 w-6 text-emerald-300" />
                </div>
                <p className="text-sm font-medium text-white">Thanks — we got it.</p>
                <p className="text-xs text-white/50">We'll look into it shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => {
                    const Icon = k.icon;
                    const active = kind === k.value;
                    return (
                      <button
                        key={k.value}
                        type="button"
                        onClick={() => setKind(k.value)}
                        className={`group flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition ${
                          active
                            ? 'border-white/20 bg-white/[0.08] text-white'
                            : 'border-white/[0.06] bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white/80'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            active ? `bg-gradient-to-r ${k.tint} bg-clip-text text-transparent` : ''
                          }`}
                        />
                        {k.label}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="Short summary"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/20 focus:bg-white/[0.05]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-white/60">Details</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={5}
                    placeholder="What happened? What did you expect?"
                    className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/20 focus:bg-white/[0.05]"
                  />
                </div>

                {!user && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-white/60">
                      Your email <span className="text-white/30">(so we can follow up)</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/20 focus:bg-white/[0.05]"
                    />
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-violet-400 hover:to-cyan-400 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    'Send report'
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
