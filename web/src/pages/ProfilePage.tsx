import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Loader2, Save, KeyRound, BarChart3, Github, Mail } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAuth } from '../auth';
import { useRouter } from '../router';

interface ExportRow {
  id: string;
  url: string;
  format: string;
  pages: number;
  bytes: number;
  status: string;
  createdAt: string;
}

interface UsageData {
  exportsThisMonth: number;
  plan: { name: string; maxExportsPerMonth: number; maxPagesPerCrawl: number } | null;
  recent: ExportRow[];
}

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const { navigate } = useRouter();
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('auth');
      return;
    }
    setName(user.name || '');
    fetch('/api/profile/usage', { credentials: 'include' })
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, [user]);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed');
      setProfileMsg('Saved');
      await refresh();
    } catch {
      setProfileMsg('Failed to save');
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMsg(null), 2500);
    }
  };

  const changePassword = async () => {
    setSavingPw(true);
    setPwMsg(null);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPwMsg({ type: 'ok', text: 'Password updated' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: any) {
      setPwMsg({ type: 'err', text: e.message || 'Failed' });
    } finally {
      setSavingPw(false);
    }
  };

  if (!user) return null;

  const isGithub = !!user.githubId;
  const exportsUsed = usage?.exportsThisMonth ?? 0;
  const exportsMax = usage?.plan?.maxExportsPerMonth ?? user.plan?.maxExportsPerMonth ?? 0;
  const pct = exportsMax > 0 ? Math.min(100, (exportsUsed / exportsMax) * 100) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.login}
            className="w-16 h-16 rounded-full border-2 border-white/10"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-2xl font-bold">
            {(user.name || user.login || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{user.name || user.login}</h1>
          <p className="text-sm text-white/40 flex items-center gap-3">
            {isGithub ? (
              <span className="inline-flex items-center gap-1">
                <Github className="w-3.5 h-3.5" /> {user.login}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> {user.email}
              </span>
            )}
            {user.plan && (
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 text-[11px] uppercase tracking-wide">
                {user.plan.name}
              </span>
            )}
          </p>
        </div>
      </motion.div>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>
        <label className="text-xs text-white/40 mb-1 block">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm focus:outline-none focus:border-violet-500/50"
        />
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={saveProfile}
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
          {profileMsg && <span className="text-xs text-white/50">{profileMsg}</span>}
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-white/60" />
          Password
        </h2>
        {isGithub && !user.email && (
          <p className="text-xs text-white/40 mb-3">
            You signed in with GitHub. You can set a password to also sign in with email later.
          </p>
        )}
        <div className="space-y-3 max-w-md">
          <input
            type="password"
            placeholder="Current password (leave blank if none)"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm focus:outline-none focus:border-violet-500/50"
          />
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm focus:outline-none focus:border-violet-500/50"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={changePassword}
              disabled={savingPw || newPassword.length < 8}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-sm font-medium cursor-pointer disabled:opacity-40"
            >
              {savingPw && <Loader2 className="w-4 h-4 animate-spin" />}
              Update password
            </button>
            {pwMsg && (
              <span className={`text-xs ${pwMsg.type === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>
                {pwMsg.text}
              </span>
            )}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-white/60" />
          This month's usage
        </h2>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold">{exportsUsed}</span>
          <span className="text-sm text-white/40">/ {exportsMax} exports</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-cyan-400"
            style={{ width: `${pct}%` }}
          />
        </div>

        <h3 className="text-sm font-semibold mt-6 mb-3 text-white/70">Recent exports</h3>
        {!usage?.recent.length ? (
          <p className="text-xs text-white/40">No exports yet.</p>
        ) : (
          <div className="space-y-2">
            {usage.recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-white/80">{r.url}</div>
                  <div className="text-[10px] text-white/40">
                    {new Date(r.createdAt).toLocaleString()} · {r.format}
                  </div>
                </div>
                <span
                  className={`ml-3 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide ${
                    r.status === 'complete'
                      ? 'bg-emerald-500/15 text-emerald-200'
                      : r.status === 'processing'
                      ? 'bg-amber-500/15 text-amber-200'
                      : 'bg-red-500/15 text-red-200'
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
