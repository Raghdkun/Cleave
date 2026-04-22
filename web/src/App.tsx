import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { ExportForm } from './components/ExportForm';
import { ProgressTracker } from './components/ProgressTracker';
import { DownloadReady } from './components/DownloadReady';
import { GlassCard } from './components/GlassCard';
import { useExport } from './hooks/useExport';

export default function App() {
  const { state, logs, startExport, cancel, reset } = useExport();

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <AnimatePresence mode="wait">
          {state.status === 'idle' && (
            <ExportForm key="form" onSubmit={startExport} />
          )}

          {state.status === 'processing' && (
            <ProgressTracker
              key="progress"
              logs={logs}
              url={state.url}
              onCancel={cancel}
            />
          )}

          {state.status === 'complete' && (
            <DownloadReady
              key="download"
              jobId={state.jobId}
              fileSize={state.fileSize}
              reactFileSize={state.reactFileSize}
              format={state.format}
              pages={state.pages}
              assets={state.assets}
              onReset={reset}
            />
          )}

          {state.status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-lg mx-auto text-center"
            >
              <GlassCard className="p-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Export Failed</h2>
                <p className="text-sm text-white/40 mb-6 max-w-sm mx-auto break-words">
                  {state.message}
                </p>
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] rounded-xl text-white transition-all flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </button>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
