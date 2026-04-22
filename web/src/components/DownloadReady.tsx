import { motion } from 'framer-motion';
import { Download, FileArchive, Layers, Image, RotateCcw, Check, Code2, FileCode } from 'lucide-react';
import { GlassCard } from './GlassCard';
import type { ExportFormat } from '../hooks/useExport';

interface DownloadReadyProps {
  jobId: string;
  fileSize: number;
  reactFileSize?: number;
  format: ExportFormat;
  pages?: number;
  assets?: number;
  onReset: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DownloadReady({ jobId, fileSize, reactFileSize, format, pages, assets, onReset }: DownloadReadyProps) {
  const downloadHtml = () => {
    window.location.href = `/api/export/${jobId}/download?format=html`;
  };
  const downloadReact = () => {
    window.location.href = `/api/export/${jobId}/download?format=react`;
  };

  const showHtml = format === 'html' || format === 'both';
  const showReact = format === 'react' || format === 'both';
  const totalSize = (showHtml ? fileSize : 0) + (showReact ? reactFileSize ?? 0 : 0);

  const stats = [
    pages != null && pages > 0 && {
      icon: Layers,
      value: String(pages),
      label: 'Pages',
      color: 'text-violet-400',
    },
    assets != null && assets > 0 && {
      icon: Image,
      value: String(assets),
      label: 'Assets',
      color: 'text-cyan-400',
    },
    {
      icon: FileArchive,
      value: formatSize(totalSize),
      label: format === 'both' ? 'Total Size' : 'File Size',
      color: 'text-pink-400',
    },
  ].filter(Boolean) as Array<{ icon: typeof Layers; value: string; label: string; color: string }>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-lg mx-auto text-center"
    >
      <GlassCard className="p-8 md:p-10">
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
        >
          <Check className="w-10 h-10 text-emerald-400" />
        </motion.div>

        <h2 className="text-2xl font-bold text-white mb-2">Export Complete</h2>
        <p className="text-white/40 mb-8">Your website has been exported successfully</p>

        {/* Stats */}
        <div className="flex justify-center gap-4 mb-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex-1 max-w-[140px] p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]"
            >
              <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-2`} />
              <div className="text-lg font-semibold text-white">{s.value}</div>
              <div className="text-xs text-white/30">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Download buttons — one or two depending on format */}
        <div className={`grid ${format === 'both' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'} gap-3 mb-4`}>
          {showHtml && (
            <motion.button
              onClick={downloadHtml}
              className="py-4 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-base cursor-pointer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FileCode className="w-5 h-5" />
              <span>HTML</span>
              <span className="text-xs font-normal text-white/70">({formatSize(fileSize)})</span>
              <Download className="w-4 h-4 ml-1" />
            </motion.button>
          )}
          {showReact && (
            <motion.button
              onClick={downloadReact}
              className={`py-4 ${
                format === 'both'
                  ? 'bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-white'
                  : 'bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white'
              } font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-base cursor-pointer`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Code2 className="w-5 h-5" />
              <span>React (Next.js)</span>
              {reactFileSize ? (
                <span className="text-xs font-normal text-white/70">({formatSize(reactFileSize)})</span>
              ) : null}
              <Download className="w-4 h-4 ml-1" />
            </motion.button>
          )}
        </div>

        {/* Export another */}
        <button
          onClick={onReset}
          className="text-sm text-white/30 hover:text-white/60 transition-colors flex items-center gap-1.5 mx-auto cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Export Another
        </button>
      </GlassCard>
    </motion.div>
  );
}
