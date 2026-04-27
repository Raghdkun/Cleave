import { motion } from 'framer-motion';
import { Check, Sparkles, Rocket, Crown } from 'lucide-react';
import { useState } from 'react';
import { GlassCard } from '../components/GlassCard';
import { useRouter } from '../router';

type Billing = 'monthly' | 'yearly';

interface Plan {
  name: string;
  tagline: string;
  icon: typeof Sparkles;
  price: { monthly: number; yearly: number };
  highlight?: boolean;
  features: string[];
  cta: string;
  accent: string;
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    tagline: 'Try it out',
    icon: Sparkles,
    price: { monthly: 0, yearly: 0 },
    features: [
      '3 exports per month',
      'Single page only',
      'HTML output',
      'Community support',
    ],
    cta: 'Get Started',
    accent: 'from-white/10 to-white/[0.02]',
  },
  {
    name: 'Pro',
    tagline: 'For builders',
    icon: Rocket,
    price: { monthly: 19, yearly: 15 },
    highlight: true,
    features: [
      'Unlimited exports',
      'Up to 200 pages per crawl',
      'HTML + React (Next.js) output',
      'Custom crawl depth & concurrency',
      'Priority email support',
    ],
    cta: 'Start Pro',
    accent: 'from-violet-500/20 to-cyan-500/10',
  },
  {
    name: 'Studio',
    tagline: 'For teams',
    icon: Crown,
    price: { monthly: 49, yearly: 39 },
    features: [
      'Everything in Pro',
      'Team workspace (5 seats)',
      'API access',
      'Webhook notifications',
      'White-glove onboarding',
    ],
    cta: 'Contact Sales',
    accent: 'from-pink-500/15 to-violet-500/10',
  },
];

export function PlansPage() {
  const [billing, setBilling] = useState<Billing>('monthly');
  const { navigate } = useRouter();

  return (
    <div className="w-full px-4 py-16 md:py-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <span className="inline-block text-xs px-3 py-1 rounded-full bg-violet-500/10 border border-violet-400/20 text-violet-300 mb-4">
            Pricing
          </span>
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-violet-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent mb-3">
            Pick your plan
          </h1>
          <p className="text-white/50 max-w-xl mx-auto">
            Start free. Upgrade when you need more pages, formats, or teammates.
          </p>
        </motion.div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            {(['monthly', 'yearly'] as Billing[]).map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className={`relative px-5 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
                  billing === b ? 'text-white' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {billing === b && (
                  <motion.span
                    layoutId="billing-pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                {b === 'monthly' ? 'Monthly' : 'Yearly'}
                {b === 'yearly' && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300">
                    -20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((plan, i) => {
            const Icon = plan.icon;
            const price = plan.price[billing];
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.5 }}
                className="relative"
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 text-white shadow-lg shadow-violet-500/30">
                    Most Popular
                  </div>
                )}
                <GlassCard
                  className={`p-6 md:p-8 h-full flex flex-col ${
                    plan.highlight ? 'border-violet-400/30 ring-1 ring-violet-400/20' : ''
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.accent} border border-white/[0.08] flex items-center justify-center mb-4`}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <p className="text-sm text-white/40 mb-5">{plan.tagline}</p>

                  <div className="mb-6">
                    <span className="text-4xl font-black text-white">${price}</span>
                    <span className="text-sm text-white/40 ml-1">
                      {price === 0 ? 'forever' : `/ mo${billing === 'yearly' ? ' (billed yearly)' : ''}`}
                    </span>
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => navigate('auth')}
                    className={`w-full py-3 rounded-xl font-semibold transition-all cursor-pointer ${
                      plan.highlight
                        ? 'bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow-md shadow-violet-500/20'
                        : 'bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-white'
                    }`}
                  >
                    {plan.cta}
                  </button>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-xs text-white/30 mt-10">
          All plans include automatic asset localization, link remapping, and analytics removal.
        </p>
      </div>
    </div>
  );
}
