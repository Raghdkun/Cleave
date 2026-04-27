import express, { type Router } from 'express';
import { prisma } from './db.js';
import { requireAdmin, type AuthedRequest } from './auth.js';

export function createAdminRouter(): Router {
  const router = express.Router();

  router.use(requireAdmin);

  // GET /api/admin/stats
  router.get('/stats', async (_req, res) => {
    const [totalUsers, totalAdmins, plans] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.plan.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { users: true } } },
      }),
    ]);

    res.json({
      totalUsers,
      totalAdmins,
      planBreakdown: plans.map((p: (typeof plans)[number]) => ({
        slug: p.slug,
        name: p.name,
        users: p._count.users,
      })),
    });
  });

  // GET /api/admin/users?q=&plan=
  router.get('/users', async (req, res) => {
    const { q, plan } = req.query as { q?: string; plan?: string };

    const where: any = {};
    if (q) {
      where.OR = [
        { login: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (plan && plan !== 'all') {
      where.plan = { slug: plan };
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
      take: 100,
    });

    res.json({ users });
  });

  // PATCH /api/admin/users/:id  { planId? role? }
  router.patch('/users/:id', async (req: AuthedRequest, res) => {
    const id = req.params.id as string;
    const { planId, role } = req.body as { planId?: string | null; role?: 'USER' | 'ADMIN' };

    if (req.user?.id === id && role && role !== 'ADMIN') {
      res.status(400).json({ error: "You can't demote yourself" });
      return;
    }

    const data: any = {};
    if (planId !== undefined) data.planId = planId || null;
    if (role) data.role = role;

    const user = await prisma.user.update({
      where: { id },
      data,
      include: { plan: true },
    });
    res.json({ user });
  });

  // DELETE /api/admin/users/:id
  router.delete('/users/:id', async (req: AuthedRequest, res) => {
    const id = req.params.id as string;
    if (req.user?.id === id) {
      res.status(400).json({ error: "You can't delete yourself" });
      return;
    }
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  });

  // GET /api/admin/plans
  router.get('/plans', async (_req, res) => {
    const plans = await prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ plans });
  });

  // PATCH /api/admin/plans/:id
  router.patch('/plans/:id', async (req, res) => {
    const id = req.params.id as string;
    const allowed = [
      'name',
      'tagline',
      'priceMonthly',
      'priceYearly',
      'stripeMonthlyPriceId',
      'stripeYearlyPriceId',
      'maxExportsPerMonth',
      'maxPagesPerCrawl',
      'allowReact',
      'allowApi',
      'seats',
      'features',
      'highlight',
      'visible',
      'sortOrder',
    ] as const;
    const data: any = {};
    for (const k of allowed) {
      if (k in req.body) data[k] = req.body[k];
    }
    const plan = await prisma.plan.update({ where: { id }, data });
    res.json({ plan });
  });

  return router;
}

// Public plans list (no auth) — only visible plans
export function createPublicPlansRouter(): Router {
  const router = express.Router();
  router.get('/', async (_req, res) => {
    const plans = await prisma.plan.findMany({
      where: { visible: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ plans });
  });
  return router;
}
