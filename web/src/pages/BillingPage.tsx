import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, ExternalLink, Sparkles, Check } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAuth } from '../auth';
import { useRouter } from '../router';

interface PlanRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  stripeMonthlyPriceId?: string | null;
  stripeYearlyPriceId?: string | null;
  features: string[];
  highlight: boolean;
  maxExportsPerMonth: number;
  maxPagesPerCrawl: number;
  allowReact: boolean;
  allowApi: boolean;
}

interface BillingStatus {
  plan: { id: string; name: string; slug: string } | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
}

export function BillingPage() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [actioning, setActioning] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('auth');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status');
    if (s === 'success') setBanner({ type: 'ok', text: 'Payment successful — welcome aboard!' });
    if (s === 'canceled') setBanner({ type: 'warn', text: 'Checkout canceled. No charge was made.' });

    Promise.all([
      fetch('/api/plans', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/billing/status', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([p, st]) => {
        const list = Array.isArray(p) ? p : Array.isArray(p?.plans) ? p.plans : [];
        setPlans(list);
        setStatus(st && typeof st === 'object' && 'plan' in st ? st : null);
      })
      .catch(() => setPlans([]));
  }, [user]);

  const subscribe = async (planId: string) => {
    setActioning(planId);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planId, interval }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setActioning(null);
    }
  };

  const openPortal = async () => {
    setActioning('portal');
    setError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not open portal');
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setActioning(null);
    }
  };

  if (!user) return null;

  const currentPlanId = status?.plan?.id;
  const isActive = ['ACTIVE', 'TRIALING'].includes(status?.status || '');
  const periodEnd = status?.currentPeriodEnd ? new Date(status.currentPeriodEnd) : null;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-12 md:py-16 space-y-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent">
          Billing
        </h1>
        <p className="text-sm text-white/40 mt-1">Manage your plan and payment method.</p>
      </motion.div>

      {banner && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            banner.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 className="w-5 h-5 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 mt-0.5" />
          )}
          <p className="text-sm">{banner.text}</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-200">
          {error}
        </div>
      )}

      <GlassCard className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Current plan</p>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">{status?.plan?.name || 'Free'}</h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wide ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : status?.status === 'PAST_DUE'
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'bg-white/[0.08] text-white/60'
                }`}
              >
                {status?.status || 'NONE'}
              </span>
            </div>
            {periodEnd && (
              <p className="text-xs text-white/40 mt-2">
                {status?.cancelAtPeriodEnd ? 'Cancels on' : 'Renews on'}{' '}
                {periodEnd.toLocaleDateString()}
              </p>
            )}
          </div>
          {status?.plan && status.plan.slug !== 'free' && (
            <button
              onClick={openPortal}
              disabled={actioning === 'portal'}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-sm font-medium cursor-pointer disabled:opacity-50"
            >
              {actioning === 'portal' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4" />
              )}
              Manage subscription
            </button>
          )}
        </div>
      </GlassCard>

      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Available plans</h2>
          <div className="inline-flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs">
            {(['month', 'year'] as const).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`relative px-3 py-1.5 rounded-lg cursor-pointer ${
                  interval === i ? 'text-white' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {interval === i && (
                  <motion.span
                    layoutId="bill-tab"
                    className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-violet-600/80 to-cyan-500/80"
                  />
                )}
                {i === 'month' ? 'Monthly' : 'Yearly · save 20%'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = p.id === currentPlanId && isActive;
            const price = interval === 'month' ? p.priceMonthly : p.priceYearly;
            const priceId =
              interval === 'month' ? p.stripeMonthlyPriceId : p.stripeYearlyPriceId;
            const isFree = price === 0 || p.slug === 'free';
            const canSubscribe = !isCurrent && !isFree && !!priceId;

            return (
              <GlassCard
                key={p.id}
                className={`p-5 relative ${
                  p.highlight ? 'border-violet-500/40 ring-1 ring-violet-500/20' : ''
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 text-[10px] uppercase font-bold tracking-wide flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Popular
                  </span>
                )}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className="text-xs text-white/40 min-h-[2.5rem] mt-1">{p.tagline}</p>
                <div className="my-4">
                  <span className="text-3xl font-black">${price}</span>
                  <span className="text-xs text-white/40 ml-1">
                    /{interval === 'month' ? 'mo' : 'yr'}
                  </span>
                </div>
                <ul className="space-y-2 mb-5 text-xs text-white/70">
                  {p.features.slice(0, 5).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-300 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-emerald-500/15 text-emerald-200 text-sm font-medium cursor-not-allowed"
                  >
                    Current plan
                  </button>
                ) : isFree ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-white/[0.05] text-white/40 text-sm font-medium cursor-not-allowed"
                  >
                    Free tier
                  </button>
                ) : (
                  <button
                    onClick={() => subscribe(p.id)}
                    disabled={!canSubscribe || actioning === p.id}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-sm font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actioning === p.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    {!priceId ? 'Coming soon' : 'Subscribe'}
                  </button>
                )}
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
