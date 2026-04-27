import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from './db.js';
import { requireAdmin, type AuthedRequest } from './auth.js';

const KIND_VALUES = ['BUG', 'FEATURE', 'GENERAL'] as const;
type Kind = (typeof KIND_VALUES)[number];

const SOURCE_VALUES = ['app', 'download', 'export', 'unknown'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submitLimiter = rateLimit({
  windowMs: 60 * 60_000, // 1 hour
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function createFeedbackRouter() {
  const router = Router();

  // Public submission — anyone (signed in or not) can file a report.
  router.post('/', submitLimiter, async (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const kindRaw = String(body.kind ?? 'BUG').toUpperCase();
    const kind: Kind = (KIND_VALUES as readonly string[]).includes(kindRaw) ? (kindRaw as Kind) : 'BUG';

    const subject = String(body.subject ?? '').trim().slice(0, 200);
    const message = String(body.message ?? '').trim().slice(0, 5000);
    if (!subject || subject.length < 3) {
      return res.status(400).json({ error: 'Subject is required (min 3 characters).' });
    }
    if (!message || message.length < 10) {
      return res.status(400).json({ error: 'Please describe the issue (min 10 characters).' });
    }

    const emailRaw = body.email ? String(body.email).trim().toLowerCase().slice(0, 200) : '';
    const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : null;

    const url = body.url ? String(body.url).trim().slice(0, 500) : null;
    const sourceRaw = String(body.source ?? 'app');
    const source = (SOURCE_VALUES as readonly string[]).includes(sourceRaw) ? sourceRaw : 'unknown';
    const userAgent = req.get('user-agent')?.slice(0, 500) ?? null;

    if (!email && !req.user) {
      return res.status(400).json({ error: 'Please include an email so we can follow up.' });
    }

    const fb = await prisma.feedback.create({
      data: {
        kind,
        subject,
        message,
        email: email ?? req.user?.email ?? null,
        url,
        source,
        userAgent,
        userId: req.user?.id ?? null,
      },
    });

    res.json({ ok: true, id: fb.id });
  });

  return router;
}

// Admin-only: list / update feedback. Mounted under /api/admin in admin router.
export function createAdminFeedbackRouter() {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', async (req, res) => {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const items = await prisma.feedback.findMany({
      where: status && ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'].includes(status)
        ? { status: status as any }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, login: true, email: true, avatarUrl: true } },
      },
    });
    res.json({ items });
  });

  router.patch('/:id', async (req, res) => {
    const id = req.params.id as string;
    const status = String(req.body?.status ?? '').toUpperCase();
    if (!['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const item = await prisma.feedback.update({
      where: { id },
      data: { status: status as any },
    });
    res.json({ item });
  });

  router.delete('/:id', async (req, res) => {
    const id = req.params.id as string;
    await prisma.feedback.delete({ where: { id } });
    res.json({ ok: true });
  });

  return router;
}
