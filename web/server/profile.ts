import express, { type Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';

export function createProfileRouter(): Router {
  const router = express.Router();
  router.use(requireAuth);

  // PATCH /api/profile  { name?, avatarUrl? }
  router.patch('/', async (req: AuthedRequest, res) => {
    const { name, avatarUrl } = req.body as { name?: string; avatarUrl?: string };
    const data: any = {};
    if (typeof name === 'string') data.name = name.slice(0, 80);
    if (typeof avatarUrl === 'string') data.avatarUrl = avatarUrl.slice(0, 500);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
    });
    res.json({ user });
  });

  // POST /api/profile/password  { currentPassword?, newPassword }
  router.post('/password', async (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ ok: true });
  });

  // GET /api/profile/usage  → exports this month + plan limits
  router.get('/usage', async (req: AuthedRequest, res) => {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const [exportsThisMonth, recent, user] = await Promise.all([
      prisma.exportJob.count({
        where: { userId: req.user!.id, createdAt: { gte: start } },
      }),
      prisma.exportJob.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.user.findUnique({
        where: { id: req.user!.id },
        include: { plan: true },
      }),
    ]);
    res.json({
      exportsThisMonth,
      plan: user?.plan ?? null,
      recent,
    });
  });

  return router;
}
