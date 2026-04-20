import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Check, Globe, Download, Code, Package, Link } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface ProgressTrackerProps {
  logs: string[];
  url: string;
  onCancel: () => void;
}

const ALL_STEPS = [
  { label: 'Crawling pages', icon: Globe },
  { label: 'Downloading assets', icon: Download },
  { label: 'Cleaning HTML', icon: Code },
  { label: 'Remapping links', icon: Link },
  { label: 'Bundling ZIP', icon: Package },
];

function parseProgress(logs: string[]) {
  let currentStep = 0;
  let totalSteps = 5;

  for (const log of logs) {
    const match = log.match(/Step (\d+)\/(\d+)/);
    if (match) {
      currentStep = parseInt(match[1]);
      totalSteps = parseInt(match[2]);
    }
  }

  return { currentStep, totalSteps };
}

export function ProgressTracker({ logs, url, onCancel }: ProgressTrackerProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const { currentStep, totalSteps } = useMemo(() => parseProgress(logs), [logs]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs]);

  const progress = totalSteps > 0 ? Math.min((currentStep / totalSteps) * 100, 100) : 0;
  const displaySteps = ALL_STEPS.slice(0, totalSteps);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-2xl mx-auto"
    >
      <GlassCard className="p-6 md:p-8">
        {/* URL label */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse-glow" />
          <span className="text-sm text-white/40 truncate">{url}</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-white/[0.06] rounded-full mb-8 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Step indicators */}
        <div className="space-y-3 mb-6">
          {displaySteps.map((step, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === currentStep;
            const isDone = stepNum < currentStep;
            const Icon = step.icon;

            return (
              <motion.div
                key={i}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isActive
                        ? 'bg-violet-500/20 text-violet-400'
                        : 'bg-white/[0.04] text-white/20'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={`text-sm transition-colors duration-300 ${
                    isDone
                      ? 'text-emerald-400/70'
                      : isActive
                        ? 'text-white'
                        : 'text-white/20'
                  }`}
                >
                  {step.label}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Live log output */}
        <div
          ref={logRef}
          className="h-44 overflow-y-auto bg-black/30 rounded-xl p-4 font-mono text-xs leading-relaxed"
        >
          {logs.map((log, i) => {
            const cleaned = log.replace(/^\[[\d\-T:.Z]+\]\s*/, '');
            const isError = cleaned.includes('[ERROR]');
            const isStep = cleaned.includes('Step ');

            return (
              <div
                key={i}
                className={
                  isError
                    ? 'text-red-400/80'
                    : isStep
                      ? 'text-cyan-400/80'
                      : 'text-white/40'
                }
              >
                {cleaned}
              </div>
            );
          })}
          {logs.length === 0 && (
            <div className="text-white/20 animate-pulse">Initializing export...</div>
          )}
        </div>

        {/* Cancel */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={onCancel}
            className="text-sm text-white/30 hover:text-red-400/70 transition-colors px-4 py-2 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </GlassCard>
    </motion.div>
  );
}
