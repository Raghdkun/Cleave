import express from 'express';
import cors from 'cors';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { stat, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(__dirname, '../..');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// ---------------------------------------------------------------------------
// Job store (in-memory – swap for Redis/Postgres when going SaaS)
// ---------------------------------------------------------------------------

interface Job {
  id: string;
  url: string;
  status: 'processing' | 'complete' | 'error';
  logs: string[];
  outputPath: string;
  process: ChildProcess | null;
  createdAt: number;
  fileSize?: number;
  pages?: number;
  assets?: number;
}

const jobs = new Map<string, Job>();

// Clean up old jobs every 10 minutes (30 min TTL)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 30 * 60 * 1000) {
      if (job.process) job.process.kill();
      unlink(job.outputPath).catch(() => {});
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(WEB_DIR, 'dist')));
}

// ---------------------------------------------------------------------------
// POST /api/export — start a new export job
// ---------------------------------------------------------------------------

app.post('/api/export', (req, res) => {
  const { url, depth = 0, maxPages = 50, concurrency = 3 } = req.body;

  // Basic URL validation
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  const jobId = randomUUID();
  const outputPath = path.join(os.tmpdir(), `cleave-${jobId}.zip`);

  const args = ['tsx', 'src/index.ts', url, '-o', outputPath];
  if (depth > 0) args.push('-d', String(depth));
  args.push('-c', String(concurrency));
  args.push('-m', String(maxPages));

  const job: Job = {
    id: jobId,
    url,
    status: 'processing',
    logs: [],
    outputPath,
    process: null,
    createdAt: Date.now(),
  };

  const proc = spawn('npx', args, {
    cwd: ROOT_DIR,
    env: { ...process.env },
    shell: true,
  });

  const onData = (data: Buffer) => {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim());
    job.logs.push(...lines);

    // Parse stats from log output
    for (const line of lines) {
      const pagesMatch = line.match(/Crawl complete:\s*(\d+)\s*pages/);
      if (pagesMatch) job.pages = parseInt(pagesMatch[1]);

      if (line.includes('Export complete')) job.pages = job.pages || 1;

      const assetMatch = line.match(/"(?:assetCount|totalAssets|assets)"[:\s]*(\d+)/);
      if (assetMatch) job.assets = parseInt(assetMatch[1]);

      const sizeMatch = line.match(/"size"[:\s]*"([\d.]+)\s*MB"/);
      if (sizeMatch) job.fileSize = parseFloat(sizeMatch[1]) * 1024 * 1024;
    }
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('close', async (code) => {
    job.status = code === 0 ? 'complete' : 'error';
    job.process = null;

    if (code === 0) {
      try {
        const stats = await stat(outputPath);
        job.fileSize = stats.size;
      } catch {
        /* file may not exist if something went wrong */
      }
    }
  });

  job.process = proc;
  jobs.set(jobId, job);

  res.json({ jobId });
});

// ---------------------------------------------------------------------------
// GET /api/export/:id/progress — SSE stream
// ---------------------------------------------------------------------------

app.get('/api/export/:id/progress', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // If already finished, send result immediately
  if (job.status === 'complete') {
    res.write(
      `data: ${JSON.stringify({ type: 'complete', fileSize: job.fileSize, pages: job.pages, assets: job.assets })}\n\n`,
    );
    res.end();
    return;
  }
  if (job.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Export failed' })}\n\n`);
    res.end();
    return;
  }

  let lastIndex = 0;

  const interval = setInterval(() => {
    // Send new log lines
    while (lastIndex < job.logs.length) {
      res.write(`data: ${JSON.stringify({ type: 'log', message: job.logs[lastIndex] })}\n\n`);
      lastIndex++;
    }

    if (job.status === 'complete') {
      res.write(
        `data: ${JSON.stringify({ type: 'complete', fileSize: job.fileSize, pages: job.pages, assets: job.assets })}\n\n`,
      );
      clearInterval(interval);
      res.end();
    } else if (job.status === 'error') {
      const lastError = job.logs.filter((l) => l.includes('[ERROR]')).pop();
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: lastError || 'Export failed' })}\n\n`,
      );
      clearInterval(interval);
      res.end();
    }
  }, 300);

  req.on('close', () => clearInterval(interval));
});

// ---------------------------------------------------------------------------
// GET /api/export/:id/download — download the ZIP
// ---------------------------------------------------------------------------

app.get('/api/export/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'complete') {
    res.status(404).json({ error: 'Export not ready' });
    return;
  }

  try {
    const hostname = new URL(job.url).hostname;
    res.download(job.outputPath, `${hostname}.zip`);
  } catch {
    res.download(job.outputPath, 'export.zip');
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/export/:id — cancel an export
// ---------------------------------------------------------------------------

app.delete('/api/export/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  if (job.process) {
    job.process.kill();
    job.process = null;
  }
  job.status = 'error';

  unlink(job.outputPath).catch(() => {});
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', jobs: jobs.size });
});

// ---------------------------------------------------------------------------
// SPA fallback (production)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(WEB_DIR, 'dist', 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`⚡ Cleave server running on http://localhost:${PORT}`);
});
