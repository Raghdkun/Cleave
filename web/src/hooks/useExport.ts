import { useState, useCallback, useRef } from 'react';

export type ExportFormat = 'html' | 'react' | 'both';

export type AppState =
  | { status: 'idle' }
  | { status: 'processing'; jobId: string; url: string }
  | {
      status: 'complete';
      jobId: string;
      fileSize: number;
      reactFileSize?: number;
      format: ExportFormat;
      pages?: number;
      assets?: number;
    }
  | { status: 'error'; message: string };

interface ExportOptions {
  depth: number;
  maxPages: number;
  concurrency: number;
  format: ExportFormat;
}

export function useExport() {
  const [state, setState] = useState<AppState>({ status: 'idle' });
  const [logs, setLogs] = useState<string[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  const startExport = useCallback(async (url: string, options: ExportOptions) => {
    setLogs([]);

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...options }),
      });

      if (!res.ok) {
        const err = await res.json();
        setState({ status: 'error', message: err.error || 'Failed to start export' });
        return;
      }

      const { jobId } = await res.json();
      setState({ status: 'processing', jobId, url });

      // Connect to SSE progress stream
      const sse = new EventSource(`/api/export/${jobId}/progress`);
      sseRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'log') {
            setLogs((prev) => [...prev, data.message]);
          } else if (data.type === 'complete') {
            setState({
              status: 'complete',
              jobId,
              fileSize: data.fileSize || 0,
              reactFileSize: data.reactFileSize,
              format: (data.format as ExportFormat) || 'html',
              pages: data.pages,
              assets: data.assets,
            });
            sse.close();
          } else if (data.type === 'error') {
            setState({ status: 'error', message: data.message || 'Export failed' });
            sse.close();
          }
        } catch {
          // Ignore parse errors
        }
      };

      sse.onerror = () => {
        setState((prev) => {
          if (prev.status === 'processing') {
            return { status: 'error', message: 'Connection to server lost' };
          }
          return prev;
        });
        sse.close();
      };
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Network error',
      });
    }
  }, []);

  const cancel = useCallback(async () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (state.status === 'processing') {
      try {
        await fetch(`/api/export/${state.jobId}`, { method: 'DELETE' });
      } catch {
        // Ignore
      }
    }
    setState({ status: 'idle' });
    setLogs([]);
  }, [state]);

  const reset = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setState({ status: 'idle' });
    setLogs([]);
  }, []);

  return { state, logs, startExport, cancel, reset };
}
