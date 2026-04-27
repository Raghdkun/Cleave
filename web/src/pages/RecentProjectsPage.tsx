import { motion } from 'framer-motion';
import {
  Search,
  Download,
  Trash2,
  ExternalLink,
  FileCode,
  Code2,
  Layers,
  Globe,
  Calendar,
  Clock,
  Plus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { GlassCard } from '../components/GlassCard';
import { useRouter } from '../router';
import type { ExportFormat } from '../hooks/useExport';

interface MockProject {
  id: string;
  url: string;
  domain: string;
  format: ExportFormat;
  pages: number;
  assets: number;
  size: string;
  createdAt: string;
  status: 'ready' | 'failed' | 'processing';
}

const MOCK_PROJECTS: MockProject[] = [
  {
    id: '1',
    url: 'https://slice-town.webflow.io',
    domain: 'slice-town.webflow.io',
    format: 'both',
    pages: 12,
    assets: 84,
    size: '4.2 MB',
    createdAt: '2 hours ago',
    status: 'ready',
  },
  {
    id: '2',
    url: 'https://grillify.framer.website',
    domain: 'grillify.framer.website',
    format: 'html',
    pages: 5,
    assets: 31,
    size: '1.8 MB',
    createdAt: 'Yesterday',
    status: 'ready',
  },
  {
    id: '3',
    url: 'https://acme-studio.com',
    domain: 'acme-studio.com',
    format: 'react',
    pages: 24,
    assets: 142,
    size: '8.7 MB',
    createdAt: '3 days ago',
    status: 'ready',
  },
  {
    id: '4',
    url: 'https://failed-example.com',
    domain: 'failed-example.com',
    format: 'html',
    pages: 0,
    assets: 0,
    size: '—',
    createdAt: '5 days ago',
    status: 'failed',
  },
  {
    id: '5',
    url: 'https://docs.bigcorp.io',
    domain: 'docs.bigcorp.io',
    format: 'html',
    pages: 56,
    assets: 210,
    size: '12.4 MB',
    createdAt: 'Last week',
    status: 'ready',
  },
];

const FORMAT_META: Record<ExportFormat, { label: string; icon: typeof FileCode; color: string }> = {
  html: { label: 'HTML', icon: FileCode, color: 'text-cyan-300 bg-cyan-500/10 border-cyan-400/20' },
  react: { label: 'React', icon: Code2, color: 'text-violet-300 bg-violet-500/10 border-violet-400/20' },
  both: { label: 'Both', icon: Layers, color: 'text-pink-300 bg-pink-500/10 border-pink-400/20' },
};

export function RecentProjectsPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | ExportFormat>('all');
  const { navigate } = useRouter();

  const filtered = useMemo(() => {
    return MOCK_PROJECTS.filter((p) => {
      const matchQ = query.trim() === '' || p.url.toLowerCase().includes(query.toLowerCase());
      const matchF = filter === 'all' || p.format === filter;
      return matchQ && matchF;
    });
  }, [query, filter]);

  return (
    <div className="w-full px-4 py-16 md:py-20">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent mb-2">
              Recent Projects
            </h1>
            <p className="text-sm text-white/40">
              Your last exports. Re-download or remove them anytime.
            </p>
          </div>
          <button
            onClick={() => navigate('home')}
            className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-sm font-semibold shadow-md shadow-violet-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Export
          </button>
        </motion.div>

        {/* Toolbar */}
        <GlassCard className="p-4 md:p-5 mb-5">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by URL…"
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 transition-all"
              />
            </div>
            <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              {(['all', 'html', 'react', 'both'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize cursor-pointer ${
                    filter === f
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* List */}
        {filtered.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <Globe className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/50">No projects match your search.</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {filtered.map((p, i) => {
              const fmt = FORMAT_META[p.format];
              const FmtIcon = fmt.icon;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                >
                  <GlassCard className="p-4 md:p-5 hover:bg-white/[0.06] transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/10 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                          <Globe className="w-5 h-5 text-white/70" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-white truncate">
                              {p.domain}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${fmt.color}`}
                            >
                              <FmtIcon className="w-3 h-3" />
                              {fmt.label}
                            </span>
                            <StatusBadge status={p.status} />
                          </div>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-white/40 hover:text-white/70 truncate inline-flex items-center gap-1"
                          >
                            {p.url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-white/40 flex-shrink-0">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" /> {p.pages}
                        </span>
                        <span className="hidden sm:inline">{p.assets} assets</span>
                        <span className="hidden md:inline">{p.size}</span>
                        <span className="hidden md:flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {p.createdAt}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          disabled={p.status !== 'ready'}
                          className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                          aria-label="Download"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg bg-white/[0.04] hover:bg-red-500/10 border border-white/[0.06] hover:border-red-500/30 text-white/50 hover:text-red-300 transition-all cursor-pointer"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-white/25 inline-flex items-center gap-1.5 justify-center w-full">
          <Calendar className="w-3 h-3" />
          Showing the last 30 days. Sign in to keep history forever.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: MockProject['status'] }) {
  const styles = {
    ready: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20',
    failed: 'bg-red-500/10 text-red-300 border-red-400/20',
    processing: 'bg-amber-500/10 text-amber-300 border-amber-400/20',
  } as const;
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
