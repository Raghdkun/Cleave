import { motion } from 'framer-motion';
import {
  Users as UsersIcon,
  Layers,
  ShieldCheck,
  Search,
  Trash2,
  Save,
  X,
  Star,
  Plus,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GlassCard } from '../components/GlassCard';
import { useAuth, type AuthUser } from '../auth';
import { useRouter } from '../router';

type Tab = 'users' | 'plans';

interface Plan {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxExportsPerMonth: number;
  maxPagesPerCrawl: number;
  allowReact: boolean;
  allowApi: boolean;
  seats: number;
  features: string[];
  highlight: boolean;
  visible: boolean;
  stripeMonthlyPriceId?: string | null;
  stripeYearlyPriceId?: string | null;
  sortOrder: number;
}

interface AdminUser extends AuthUser {
  createdAt: string;
  lastLoginAt: string | null;
  plan: Plan | null;
}

interface Stats {
  totalUsers: number;
  totalAdmins: number;
  planBreakdown: { slug: string; name: string; users: number }[];
}

const fetchJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
};

export function DashboardPage() {
  const { user, loading } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => {
    if (!loading && (!user || user.role !== 'ADMIN')) {
      navigate(user ? 'home' : 'auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="w-full px-4 py-20 flex justify-center text-white/50">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="w-full px-4 py-12 md:py-16">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8"
        >
          <div>
            <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-violet-500/10 border border-violet-400/20 text-violet-300 mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Dashboard
            </div>
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent">
              Welcome, {user.name || user.login}
            </h1>
            <p className="text-sm text-white/40 mt-1">
              Manage users, plans, and feature limits.
            </p>
          </div>
        </motion.div>

        <StatsCards />

        {/* Tabs */}
        <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit mt-8 mb-5">
          {(
            [
              { id: 'users', label: 'Users', icon: UsersIcon },
              { id: 'plans', label: 'Plans', icon: Layers },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                tab === t.id ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="dash-tab"
                  className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-violet-600/80 to-cyan-500/80"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'users' ? <UsersTab currentUserId={user.id} /> : <PlansTab />}
      </div>
    </div>
  );
}

// -------- Stats --------

function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchJson('/api/admin/stats').then(setStats).catch(console.error);
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i} className="p-5 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, color: 'text-violet-300' },
    { label: 'Admins', value: stats.totalAdmins, color: 'text-cyan-300' },
    ...stats.planBreakdown.map((p) => ({
      label: `${p.name} users`,
      value: p.users,
      color: 'text-pink-300',
    })),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <GlassCard key={c.label} className="p-5">
          <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
          <div className="text-xs text-white/40 mt-1">{c.label}</div>
        </GlassCard>
      ))}
    </div>
  );
}

// -------- Users tab --------

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (planFilter !== 'all') params.set('plan', planFilter);
      const data = await fetchJson(`/api/admin/users?${params}`);
      setUsers(data.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJson('/api/admin/plans').then((d) => setPlans(d.plans));
  }, []);
  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, planFilter]);

  const updateUser = async (id: string, data: Partial<{ planId: string | null; role: 'USER' | 'ADMIN' }>) => {
    try {
      const res = await fetchJson(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...res.user } : u)));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await fetchJson(`/api/admin/users/${id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div>
      <GlassCard className="p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, login, or email…"
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 transition-all"
            />
          </div>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-violet-500/50 cursor-pointer"
          >
            <option value="all">All plans</option>
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </GlassCard>

      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Joined</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isMe = u.id === currentUserId;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.avatarUrl ? (
                            <img
                              src={u.avatarUrl}
                              alt={u.login}
                              className="w-8 h-8 rounded-full border border-white/10"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400" />
                          )}
                          <div className="min-w-0">
                            <div className="text-white font-medium truncate">
                              {u.name || u.login} {isMe && <span className="text-[10px] text-violet-300">(you)</span>}
                            </div>
                            <div className="text-xs text-white/40">@{u.login}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/60 hidden md:table-cell truncate max-w-[200px]">
                        {u.email || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.planId || ''}
                          onChange={(e) => updateUser(u.id, { planId: e.target.value || null })}
                          className="px-2.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500/50 cursor-pointer"
                        >
                          <option value="">— None —</option>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isMe}
                          onChange={(e) =>
                            updateUser(u.id, { role: e.target.value as 'USER' | 'ADMIN' })
                          }
                          className="px-2.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="USER">User</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs hidden lg:table-cell">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          disabled={isMe}
                          onClick={() => deleteUser(u.id)}
                          className="p-2 rounded-lg bg-white/[0.04] hover:bg-red-500/10 border border-white/[0.06] hover:border-red-500/30 text-white/50 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                          aria-label="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

// -------- Plans tab --------

function PlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/admin/plans');
      setPlans(data.plans);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  if (loading) {
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <GlassCard key={i} className="p-6 h-72 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {plans.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          editing={editingId === plan.id}
          onEdit={() => setEditingId(plan.id)}
          onCancel={() => setEditingId(null)}
          onSaved={(p) => {
            setPlans((prev) => prev.map((x) => (x.id === p.id ? p : x)));
            setEditingId(null);
          }}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  plan: Plan;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (p: Plan) => void;
}) {
  const [draft, setDraft] = useState<Plan>(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) setDraft(plan);
  }, [editing, plan]);

  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await fetchJson(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          tagline: draft.tagline,
          priceMonthly: Number(draft.priceMonthly),
          priceYearly: Number(draft.priceYearly),
          maxExportsPerMonth: Number(draft.maxExportsPerMonth),
          maxPagesPerCrawl: Number(draft.maxPagesPerCrawl),
          allowReact: draft.allowReact,
          allowApi: draft.allowApi,
          seats: Number(draft.seats),
          features: draft.features,
          highlight: draft.highlight,
          visible: draft.visible,
          stripeMonthlyPriceId: draft.stripeMonthlyPriceId || null,
          stripeYearlyPriceId: draft.stripeYearlyPriceId || null,
        }),
      });
      onSaved(data.plan);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard
      className={`p-6 flex flex-col ${
        plan.highlight ? 'border-violet-400/30 ring-1 ring-violet-400/20' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">{plan.name}</h3>
            {plan.highlight && <Star className="w-4 h-4 text-violet-300 fill-violet-300" />}
            {!plan.visible && (
              <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] text-white/50 uppercase tracking-wide">
                Hidden
              </span>
            )}
          </div>
          <code className="text-[10px] text-white/30">/{plan.slug}</code>
        </div>
        {!editing ? (
          <button
            onClick={onEdit}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/70 hover:text-white cursor-pointer transition-all"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-white/60 cursor-pointer"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="p-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 text-white cursor-pointer disabled:opacity-50"
              aria-label="Save"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      <div className="space-y-3 text-sm">
        <Row label="Tagline">
          {editing ? (
            <input
              value={draft.tagline ?? ''}
              onChange={(e) => set('tagline', e.target.value)}
              className={inputCls}
            />
          ) : (
            <span className="text-white/70">{plan.tagline || '—'}</span>
          )}
        </Row>

        <div className="grid grid-cols-2 gap-3">
          <Row label="$ / mo">
            {editing ? (
              <input
                type="number"
                value={draft.priceMonthly}
                onChange={(e) => set('priceMonthly', Number(e.target.value))}
                className={inputCls}
              />
            ) : (
              <span className="text-white/70">${(plan.priceMonthly / 100).toFixed(2)}</span>
            )}
          </Row>
          <Row label="$ / yr (per mo)">
            {editing ? (
              <input
                type="number"
                value={draft.priceYearly}
                onChange={(e) => set('priceYearly', Number(e.target.value))}
                className={inputCls}
              />
            ) : (
              <span className="text-white/70">${(plan.priceYearly / 100).toFixed(2)}</span>
            )}
          </Row>
        </div>

        <Row label="Max exports / mo">
          {editing ? (
            <input
              type="number"
              value={draft.maxExportsPerMonth}
              onChange={(e) => set('maxExportsPerMonth', Number(e.target.value))}
              className={inputCls}
            />
          ) : (
            <span className="text-white/70">{plan.maxExportsPerMonth.toLocaleString()}</span>
          )}
        </Row>
        <Row label="Max pages / crawl">
          {editing ? (
            <input
              type="number"
              value={draft.maxPagesPerCrawl}
              onChange={(e) => set('maxPagesPerCrawl', Number(e.target.value))}
              className={inputCls}
            />
          ) : (
            <span className="text-white/70">{plan.maxPagesPerCrawl.toLocaleString()}</span>
          )}
        </Row>
        <Row label="Seats">
          {editing ? (
            <input
              type="number"
              value={draft.seats}
              onChange={(e) => set('seats', Number(e.target.value))}
              className={inputCls}
            />
          ) : (
            <span className="text-white/70">{plan.seats}</span>
          )}
        </Row>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <Toggle
            label="React output"
            checked={editing ? draft.allowReact : plan.allowReact}
            onChange={(v) => editing && set('allowReact', v)}
            disabled={!editing}
          />
          <Toggle
            label="API access"
            checked={editing ? draft.allowApi : plan.allowApi}
            onChange={(v) => editing && set('allowApi', v)}
            disabled={!editing}
          />
        </div>

        <Toggle
          label="Mark as featured"
          checked={editing ? draft.highlight : plan.highlight}
          onChange={(v) => editing && set('highlight', v)}
          disabled={!editing}
        />

        <Toggle
          label="Visible on pricing page"
          checked={editing ? draft.visible : plan.visible}
          onChange={(v) => editing && set('visible', v)}
          disabled={!editing}
        />

        <Row label="Stripe price (monthly)">
          {editing ? (
            <input
              value={draft.stripeMonthlyPriceId ?? ''}
              onChange={(e) => set('stripeMonthlyPriceId', e.target.value)}
              placeholder="price_..."
              className={inputCls}
            />
          ) : (
            <code className="text-[10px] text-white/40 truncate block">
              {plan.stripeMonthlyPriceId || '—'}
            </code>
          )}
        </Row>
        <Row label="Stripe price (yearly)">
          {editing ? (
            <input
              value={draft.stripeYearlyPriceId ?? ''}
              onChange={(e) => set('stripeYearlyPriceId', e.target.value)}
              placeholder="price_..."
              className={inputCls}
            />
          ) : (
            <code className="text-[10px] text-white/40 truncate block">
              {plan.stripeYearlyPriceId || '—'}
            </code>
          )}
        </Row>

        <FeaturesEditor
          editing={editing}
          features={editing ? draft.features : plan.features}
          onChange={(f) => set('features', f)}
        />
      </div>
    </GlassCard>
  );
}

const inputCls =
  'w-full px-2.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white text-xs focus:outline-none focus:border-violet-500/50';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-white/40">{label}</span>
      <div className="flex-1 max-w-[60%] text-right">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
        checked
          ? 'bg-violet-500/15 border-violet-400/30 text-white'
          : 'bg-white/[0.04] border-white/[0.06] text-white/50'
      } ${disabled ? 'cursor-default' : 'cursor-pointer hover:border-white/20'}`}
    >
      <span>{label}</span>
      <span
        className={`w-3.5 h-3.5 rounded flex items-center justify-center ${
          checked ? 'bg-violet-400 text-[#0a0a14]' : 'bg-white/10'
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

function FeaturesEditor({
  editing,
  features,
  onChange,
}: {
  editing: boolean;
  features: string[];
  onChange: (f: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const items = useMemo(() => features ?? [], [features]);

  return (
    <div className="pt-2 border-t border-white/[0.05]">
      <div className="text-xs text-white/40 mb-2">Features</div>
      <ul className="space-y-1.5 mb-2">
        {items.map((f, i) => (
          <li
            key={i}
            className="flex items-center gap-2 text-xs text-white/70 group"
          >
            <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            <span className="flex-1">{f}</span>
            {editing && (
              <button
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-300 cursor-pointer"
                aria-label="Remove feature"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-xs text-white/30 italic">No features yet</li>
        )}
      </ul>
      {editing && (
        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                e.preventDefault();
                onChange([...items, draft.trim()]);
                setDraft('');
              }
            }}
            placeholder="Add a feature…"
            className={inputCls + ' flex-1'}
          />
          <button
            type="button"
            onClick={() => {
              if (!draft.trim()) return;
              onChange([...items, draft.trim()]);
              setDraft('');
            }}
            className="px-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 cursor-pointer"
            aria-label="Add"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
