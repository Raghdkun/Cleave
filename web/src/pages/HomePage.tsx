import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, RotateCcw, FlaskConical, ArrowRight } from 'lucide-react';
import { ExportForm } from '../components/ExportForm';
import { ProgressTracker } from '../components/ProgressTracker';
import { DownloadReady } from '../components/DownloadReady';
import { GlassCard } from '../components/GlassCard';
import { useExport } from '../hooks/useExport';
import { useFeedback } from '../components/FeedbackProvider';

export function HomePage() {
  const { state, logs, startExport, cancel, reset } = useExport();
  const { open: openFeedback } = useFeedback();

  return (
    <div className="flex flex-col items-center justify-center w-full px-4 py-16 md:py-20">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mb-10 flex max-w-fit flex-wrap items-center justify-center gap-2.5 rounded-full border border-white/[0.08] bg-gradient-to-r from-violet-500/[0.08] via-white/[0.03] to-cyan-500/[0.08] px-4 py-2 text-xs backdrop-blur-md sm:text-sm"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-cyan-400 shadow-[0_0_18px_rgba(139,92,246,0.45)]">
          <FlaskConical className="h-3 w-3 text-white" />
        </span>
        <span className="font-semibold tracking-tight bg-gradient-to-r from-violet-200 to-cyan-200 bg-clip-text text-transparent">
          Hey, we're in beta!
        </span>
        <span className="hidden text-white/40 sm:inline">·</span>
        <span className="text-white/60">
          Cleave is fresh out of the oven and getting better every week.
        </span>
        <button
          type="button"
          onClick={() => openFeedback({ kind: 'GENERAL' })}
          className="group ml-1 inline-flex items-center gap-1 font-medium text-white/80 transition hover:text-white"
        >
          Tell us what to build next
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </button>
      </motion.div>

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
  );
}
