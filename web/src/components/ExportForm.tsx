import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, ChevronDown, Zap } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface ExportFormProps {
  onSubmit: (url: string, options: { depth: number; maxPages: number; concurrency: number }) => void;
}

export function ExportForm({ onSubmit }: ExportFormProps) {
  const [url, setUrl] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [depth, setDepth] = useState(0);
  const [maxPages, setMaxPages] = useState(50);
  const [concurrency, setConcurrency] = useState(3);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim(), { depth, maxPages, concurrency });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-2xl mx-auto text-center"
    >
      {/* Hero */}
      <motion.h1
        className="text-6xl md:text-8xl font-black mb-4 bg-gradient-to-r from-violet-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent leading-tight"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6 }}
      >
        Cleave
      </motion.h1>

      <motion.p
        className="text-lg md:text-xl text-white/50 mb-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Export any website to clean, self-contained HTML
      </motion.p>

      <motion.div
        className="flex flex-wrap justify-center gap-2 mb-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {['Webflow', 'Framer', 'Wix', 'Any Website'].map((tag) => (
          <span
            key={tag}
            className="text-xs px-3 py-1 rounded-full bg-white/[0.06] text-white/40 border border-white/[0.06]"
          >
            {tag}
          </span>
        ))}
      </motion.div>

      {/* Form Card */}
      <GlassCard
        className="p-6 md:p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-website.com"
                className="w-full pl-12 pr-4 py-4 bg-white/[0.06] border border-white/[0.1] rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all text-lg"
                required
              />
            </div>
            <motion.button
              type="submit"
              disabled={!url.trim()}
              className="px-8 py-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-lg cursor-pointer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Zap className="w-5 h-5" />
              Export
            </motion.button>
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="mt-4 text-sm text-white/30 hover:text-white/50 transition-colors flex items-center gap-1 mx-auto cursor-pointer"
          >
            Advanced Options
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${showOptions ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Advanced Options Panel */}
          <motion.div
            initial={false}
            animate={{
              height: showOptions ? 'auto' : 0,
              opacity: showOptions ? 1 : 0,
            }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/[0.06]">
              <div>
                <label className="block text-xs text-white/40 mb-1.5 text-left">Crawl Depth</label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={depth}
                  onChange={(e) => setDepth(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-violet-500/50 transition-all"
                />
                <p className="text-[10px] text-white/20 mt-1 text-left">0 = single page</p>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5 text-left">Max Pages</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={maxPages}
                  onChange={(e) => setMaxPages(parseInt(e.target.value) || 50)}
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-violet-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5 text-left">Concurrency</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value) || 3)}
                  className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-violet-500/50 transition-all"
                />
              </div>
            </div>
          </motion.div>
        </form>
      </GlassCard>

      {/* Footer hint */}
      <motion.p
        className="mt-6 text-xs text-white/20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        Removes analytics, builder artifacts, and localizes all assets
      </motion.p>
    </motion.div>
  );
}
