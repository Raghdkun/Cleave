import type { Request, Response, NextFunction, Router } from 'express';
import express from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';

export const SESSION_COOKIE = 'cleave_sid';
const STATE_COOKIE = 'cleave_oauth_state';
const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// ------------------------------------------------------------------
// Session helpers
// ------------------------------------------------------------------

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    githubId: string | null;
    login: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    role: 'USER' | 'ADMIN';
    planId: string | null;
  };
  sessionToken?: string;
}

async function createSession(userId: string, res: Response) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  setSessionCookie(res, token, expiresAt);
  return token;
}

export async function loadSession(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (session && session.expiresAt > new Date()) {
      const u = session.user;
      req.user = {
        id: u.id,
        githubId: u.githubId,
        login: u.login,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        role: u.role,
        planId: u.planId,
      };
      req.sessionToken = token;
    }
  } catch (e) {
    console.error('[auth] loadSession error', e);
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

export function createAuthRouter(): Router {
  const router = express.Router();

  // GET /api/auth/me
  router.get('/me', async (req: AuthedRequest, res) => {
    if (!req.user) return res.json({ user: null });
    // Hydrate with plan + subscription
    const fresh = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { plan: true },
    });
    if (!fresh) return res.json({ user: null });
    res.json({
      user: {
        id: fresh.id,
        githubId: fresh.githubId,
        login: fresh.login,
        email: fresh.email,
        name: fresh.name,
        avatarUrl: fresh.avatarUrl,
        role: fresh.role,
        planId: fresh.planId,
        plan: fresh.plan,
        subscriptionStatus: fresh.subscriptionStatus,
        currentPeriodEnd: fresh.currentPeriodEnd,
        cancelAtPeriodEnd: fresh.cancelAtPeriodEnd,
      },
    });
  });

  // POST /api/auth/register { email, password, name? }
  router.post('/register', async (req, res) => {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const lowerEmail = email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
    const login = lowerEmail.split('@')[0];
    const user = await prisma.user.create({
      data: {
        email: lowerEmail,
        passwordHash,
        login,
        name: name || null,
        planId: freePlan?.id,
        lastLoginAt: new Date(),
      },
    });
    await createSession(user.id, res);
    res.json({ ok: true });
  });

  // POST /api/auth/login { email, password }
  router.post('/login', async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createSession(user.id, res);
    res.json({ ok: true });
  });

  // POST /api/auth/logout
  router.post('/logout', async (req: AuthedRequest, res) => {
    if (req.sessionToken) {
      await prisma.session.deleteMany({ where: { token: req.sessionToken } }).catch(() => {});
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // GET /api/auth/github → redirect to GitHub
  router.get('/github', (_req, res) => {
    const clientId = getEnv('GITHUB_CLIENT_ID');
    const callback = getEnv('GITHUB_CALLBACK_URL');
    const state = randomBytes(16).toString('hex');

    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      scope: 'read:user user:email',
      state,
      allow_signup: 'true',
    });

    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  // GET /api/auth/github/callback
  router.get('/github/callback', async (req, res) => {
    const webBase = process.env.WEB_BASE_URL || 'http://localhost:5173';
    const { code, state } = req.query as Record<string, string | undefined>;
    const cookieState = (req as AuthedRequest).cookies?.[STATE_COOKIE];

    res.clearCookie(STATE_COOKIE, { path: '/' });

    if (!code || !state || !cookieState || state !== cookieState) {
      return res.redirect(`${webBase}/auth?error=oauth_state`);
    }

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: getEnv('GITHUB_CLIENT_ID'),
          client_secret: getEnv('GITHUB_CLIENT_SECRET'),
          code,
          redirect_uri: getEnv('GITHUB_CALLBACK_URL'),
        }),
      });
      const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
      };
      if (!tokenJson.access_token) {
        console.error('[auth] token exchange failed', tokenJson);
        return res.redirect(`${webBase}/auth?error=oauth_token`);
      }

      const accessToken = tokenJson.access_token;

      // Profile
      const profileRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Cleave-App',
        },
      });
      const profile = (await profileRes.json()) as {
        id: number;
        login: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
      };

      // Primary email
      let email: string | null = profile.email;
      if (!email) {
        try {
          const emailsRes = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'Cleave-App',
            },
          });
          const emails = (await emailsRes.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const primary = Array.isArray(emails)
            ? emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)
            : null;
          if (primary) email = primary.email;
        } catch (e) {
          console.warn('[auth] could not fetch emails', e);
        }
      }

      const githubId = String(profile.id);
      const initialAdminLogin = process.env.INITIAL_ADMIN_GITHUB_LOGIN?.toLowerCase();
      const isInitialAdmin =
        !!initialAdminLogin && profile.login.toLowerCase() === initialAdminLogin;

      // Default plan = free
      const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });

      const user = await prisma.user.upsert({
        where: { githubId },
        update: {
          login: profile.login,
          email,
          name: profile.name,
          avatarUrl: profile.avatar_url,
          lastLoginAt: new Date(),
          ...(isInitialAdmin ? { role: 'ADMIN' as const } : {}),
        },
        create: {
          githubId,
          login: profile.login,
          email,
          name: profile.name,
          avatarUrl: profile.avatar_url,
          role: isInitialAdmin ? 'ADMIN' : 'USER',
          planId: freePlan?.id,
          lastLoginAt: new Date(),
        },
      });

      // Create session
      await createSession(user.id, res);

      // Admins land on dashboard, regular users on home
      const dest = user.role === 'ADMIN' ? '/dashboard' : '/';
      return res.redirect(`${webBase}${dest}`);
    } catch (e) {
      console.error('[auth] github callback error', e);
      return res.redirect(`${webBase}/auth?error=oauth_failed`);
    }
  });

  return router;
}
