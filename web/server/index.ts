import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { stat, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createAuthRouter, loadSession, requireAuth, type AuthedRequest } from './auth.js';
import { createAdminRouter, createPublicPlansRouter } from './admin.js';
import { createBillingRouter, handleStripeWebhook } from './billing.js';
import { createProfileRouter } from './profile.js';
import { createFeedbackRouter, createAdminFeedbackRouter } from './feedback.js';
import { prisma } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(__dirname, '../..');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

interface Job {
  id: string;
  userId: string;
  url: string;
  status: 'processing' | 'complete' | 'error';
  logs: string[];
  outputPath: string;
  reactPath: string;
  format: 'html' | 'react' | 'both';
  process: ChildProcess | null;
  createdAt: number;
  fileSize?: number;
  reactFileSize?: number;
  pages?: number;
  assets?: number;
  dbId?: string;
}

const jobs = new Map<string, Job>();

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 30 * 60 * 1000) {
      if (job.process) job.process.kill();
      unlink(job.outputPath).catch(() => {});
      unlink(job.reactPath).catch(() => {});
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000);

const app = express();
app.set('trust proxy', 1);

// Stripe webhook MUST receive the raw body — register BEFORE express.json()
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook,
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  cors({
    origin: process.env.WEB_BASE_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(loadSession);

const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
const exportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', createAuthRouter());
app.use('/api/admin', createAdminRouter());
app.use('/api/admin/feedback', createAdminFeedbackRouter());
app.use('/api/plans', createPublicPlansRouter());
app.use('/api/billing', createBillingRouter());
app.use('/api/profile', createProfileRouter());
app.use('/api/feedback', createFeedbackRouter());

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(WEB_DIR, 'dist')));
}

app.post('/api/export', exportLimiter, requireAuth, async (req: AuthedRequest, res) => {
  const { url, depth = 0, maxPages = 50, concurrency = 3, format = 'html' } = req.body;

  if (!['html', 'react', 'both'].includes(format)) {
    return res.status(400).json({ error: "format must be 'html', 'react', or 'both'" });
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { plan: true },
  });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const plan = user.plan;
  if (!plan) return res.status(403).json({ error: 'No plan assigned. Contact support.' });

  if ((format === 'react' || format === 'both') && !plan.allowReact) {
    return res.status(403).json({
      error: 'React output requires the Pro plan or higher.',
      upgrade: true,
    });
  }
  const requestedPages = Math.max(1, Number(maxPages) || 1);
  if (requestedPages > plan.maxPagesPerCrawl) {
    return res.status(403).json({
      error: `Your plan allows up to ${plan.maxPagesPerCrawl} pages per crawl. Upgrade for more.`,
      upgrade: true,
    });
  }

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const used = await prisma.exportJob.count({
    where: { userId: user.id, createdAt: { gte: start } },
  });
  if (used >= plan.maxExportsPerMonth) {
    return res.status(403).json({
      error: `Monthly export limit reached (${plan.maxExportsPerMonth}). Upgrade for more.`,
      upgrade: true,
    });
  }

  const jobId = randomUUID();
  const outputPath = path.join(os.tmpdir(), `cleave-${jobId}.zip`);
  const reactPath = path.join(os.tmpdir(), `cleave-${jobId}-react.zip`);

  const args = ['tsx', 'src/index.ts', url, '-o', outputPath];
  if (depth > 0) args.push('-d', String(depth));
  args.push('-c', String(Math.max(1, Math.min(10, Number(concurrency) || 3))));
  args.push('-m', String(requestedPages));
  args.push('-f', format);

  const dbJob = await prisma.exportJob.create({
    data: { userId: user.id, url, format, status: 'processing' },
  });

  const job: Job = {
    id: jobId,
    userId: user.id,
    url,
    status: 'processing',
    logs: [],
    outputPath,
    reactPath,
    format: format as 'html' | 'react' | 'both',
    process: null,
    createdAt: Date.now(),
    dbId: dbJob.id,
  };

  const proc = spawn('npx', args, {
    cwd: ROOT_DIR,
    env: { ...process.env },
    shell: true,
  });

  const onData = (data: Buffer) => {
    const lines = data.toString().split('\n').filter((l) => l.trim());
    job.logs.push(...lines);
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
      if (job.format === 'html') {
        try { job.fileSize = (await stat(outputPath)).size; } catch {}
      } else if (job.format === 'react') {
        try {
          const stats = await stat(outputPath);
          job.reactFileSize = stats.size;
          job.reactPath = outputPath;
        } catch {}
      } else {
        try { job.fileSize = (await stat(outputPath)).size; } catch {}
        try { job.reactFileSize = (await stat(reactPath)).size; } catch {}
      }
    }

    if (job.dbId) {
      await prisma.exportJob
        .update({
          where: { id: job.dbId },
          data: {
            status: job.status,
            pages: job.pages ?? 0,
            bytes: (job.fileSize ?? 0) + (job.reactFileSize ?? 0),
          },
        })
        .catch(() => {});
    }
  });

  job.process = proc;
  jobs.set(jobId, job);

  res.json({ jobId });
});

app.get('/api/export/:id/progress', requireAuth, (req: AuthedRequest, res) => {
  const job = jobs.get(req.params.id as string);
  if (!job || job.userId !== req.user!.id) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (job.status === 'complete') {
    res.write(
      `data: ${JSON.stringify({ type: 'complete', fileSize: job.fileSize, reactFileSize: job.reactFileSize, format: job.format, pages: job.pages, assets: job.assets })}\n\n`,
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
    while (lastIndex < job.logs.length) {
      res.write(`data: ${JSON.stringify({ type: 'log', message: job.logs[lastIndex] })}\n\n`);
      lastIndex++;
    }
    if (job.status === 'complete') {
      res.write(
        `data: ${JSON.stringify({ type: 'complete', fileSize: job.fileSize, reactFileSize: job.reactFileSize, format: job.format, pages: job.pages, assets: job.assets })}\n\n`,
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

app.get('/api/export/:id/download', requireAuth, (req: AuthedRequest, res) => {
  const job = jobs.get(req.params.id as string);
  if (!job || job.userId !== req.user!.id || job.status !== 'complete') {
    return res.status(404).json({ error: 'Export not ready' });
  }
  const variant = (req.query.format as string) === 'react' ? 'react' : 'html';
  const filePath = variant === 'react' ? job.reactPath : job.outputPath;
  const suffix = variant === 'react' ? '-react' : '';
  try {
    const hostname = new URL(job.url).hostname;
    res.download(filePath, `${hostname}${suffix}.zip`);
  } catch {
    res.download(filePath, `export${suffix}.zip`);
  }
});

app.delete('/api/export/:id', requireAuth, (req: AuthedRequest, res) => {
  const job = jobs.get(req.params.id as string);
  if (!job || job.userId !== req.user!.id) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (job.process) {
    job.process.kill();
    job.process = null;
  }
  job.status = 'error';
  unlink(job.outputPath).catch(() => {});
  unlink(job.reactPath).catch(() => {});
  res.json({ success: true });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', jobs: jobs.size });
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(WEB_DIR, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`⚡ Cleave server running on http://localhost:${PORT}`);
});
