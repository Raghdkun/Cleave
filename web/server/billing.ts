import express, { type Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { prisma } from './db.js';
import { requireAuth, type AuthedRequest } from './auth.js';

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  stripeClient = new Stripe(key, { apiVersion: '2024-10-28.acacia' as any });
  return stripeClient;
}

const WEB_BASE_URL = () => process.env.WEB_BASE_URL || 'http://localhost:5173';

async function ensureCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.name ?? user.login,
    metadata: { userId: user.id },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// Webhook handler (raw body)
export async function handleStripeWebhook(req: Request, res: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).send('Webhook not configured');
    return;
  }
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    res.status(400).send('Missing signature');
    return;
  }
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err: any) {
    console.error('[stripe] webhook signature error', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        if (userId && planId && session.subscription) {
          const subId = session.subscription as string;
          const sub = (await stripe.subscriptions.retrieve(subId)) as any;
          await prisma.user.update({
            where: { id: userId },
            data: {
              planId,
              stripeSubscriptionId: subId,
              subscriptionStatus: mapStatus(sub.status),
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
            },
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const user = await prisma.user.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });
        if (user) {
          // Find plan by stripe price id
          const priceId = sub.items.data[0]?.price.id;
          let nextPlanId = user.planId;
          if (priceId) {
            const plan = await prisma.plan.findFirst({
              where: {
                OR: [{ stripeMonthlyPriceId: priceId }, { stripeYearlyPriceId: priceId }],
              },
            });
            if (plan) nextPlanId = plan.id;
          }
          // On cancellation/deletion, drop to free
          let status = mapStatus(sub.status);
          if (event.type === 'customer.subscription.deleted') {
            status = 'CANCELED';
            const free = await prisma.plan.findUnique({ where: { slug: 'free' } });
            if (free) nextPlanId = free.id;
          }
          await prisma.user.update({
            where: { id: user.id },
            data: {
              planId: nextPlanId,
              subscriptionStatus: status,
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            },
          });
        }
        break;
      }
      default:
        // ignore others
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe] webhook handler error', err);
    res.status(500).send('Webhook handler failed');
  }
}

function mapStatus(s: Stripe.Subscription.Status): any {
  switch (s) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
      return 'INCOMPLETE';
    default:
      return 'NONE';
  }
}

export function createBillingRouter(): Router {
  const router = express.Router();
  router.use(requireAuth);

  // POST /api/billing/checkout { planId, interval: 'month' | 'year' }
  router.post('/checkout', async (req: AuthedRequest, res) => {
    try {
      const { planId, interval } = req.body as {
        planId?: string;
        interval?: 'month' | 'year';
      };
      if (!planId || !['month', 'year'].includes(interval || '')) {
        return res.status(400).json({ error: 'planId and interval required' });
      }
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      const priceId =
        interval === 'year' ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
      if (!priceId) {
        return res.status(400).json({ error: 'This plan is not configured for billing yet' });
      }

      const customerId = await ensureCustomer(req.user!.id);
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${WEB_BASE_URL()}/billing?status=success`,
        cancel_url: `${WEB_BASE_URL()}/billing?status=canceled`,
        allow_promotion_codes: true,
        metadata: { userId: req.user!.id, planId: plan.id, interval: interval as string },
        subscription_data: {
          metadata: { userId: req.user!.id, planId: plan.id },
        },
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error('[billing] checkout error', e);
      res.status(500).json({ error: e.message || 'Checkout failed' });
    }
  });

  // POST /api/billing/portal — open Stripe customer portal
  router.post('/portal', async (req: AuthedRequest, res) => {
    try {
      const customerId = await ensureCustomer(req.user!.id);
      const stripe = getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${WEB_BASE_URL()}/billing`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      console.error('[billing] portal error', e);
      res.status(500).json({ error: e.message || 'Portal failed' });
    }
  });

  // GET /api/billing/status
  router.get('/status', async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { plan: true },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({
      plan: user.plan,
      status: user.subscriptionStatus,
      currentPeriodEnd: user.currentPeriodEnd,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      hasPaymentMethod: Boolean(user.stripeCustomerId),
    });
  });

  return router;
}
