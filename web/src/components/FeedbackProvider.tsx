import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ReportBugModal } from './ReportBugModal';

type Kind = 'BUG' | 'FEATURE' | 'GENERAL';
type Source = 'app' | 'download' | 'export';

interface OpenOpts {
  kind?: Kind;
  source?: Source;
}

interface Ctx {
  open: (opts?: OpenOpts) => void;
}

const FeedbackCtx = createContext<Ctx>({ open: () => {} });

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('BUG');
  const [source, setSource] = useState<Source>('app');

  const openModal = useCallback((opts?: OpenOpts) => {
    if (opts?.kind) setKind(opts.kind);
    if (opts?.source) setSource(opts.source);
    setOpen(true);
  }, []);

  // Auto-open when ?source=download (links from REPORT_A_BUG.txt land here)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const src = params.get('source');
    const path = window.location.pathname;
    if (path.startsWith('/feedback') || src === 'download' || src === 'export') {
      openModal({ source: (src as Source) || 'download' });
      // Clean the query so refreshing doesn't re-open.
      params.delete('source');
      const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', clean === '/feedback' ? '/' : clean);
    }
  }, [openModal]);

  const value = useMemo<Ctx>(() => ({ open: openModal }), [openModal]);

  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      <ReportBugModal open={open} onClose={() => setOpen(false)} defaultKind={kind} source={source} />
    </FeedbackCtx.Provider>
  );
}

export function useFeedback() {
  return useContext(FeedbackCtx);
}
