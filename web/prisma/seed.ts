/* eslint-disable */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      slug: 'free',
      name: 'Free',
      tagline: 'Try it out',
      priceMonthly: 0,
      priceYearly: 0,
      maxExportsPerMonth: 3,
      maxPagesPerCrawl: 1,
      allowReact: false,
      allowApi: false,
      seats: 1,
      features: ['3 exports per month', 'Single page only', 'HTML output', 'Community support'],
      highlight: false,
      visible: true,
      sortOrder: 0,
    },
    {
      slug: 'pro',
      name: 'Pro',
      tagline: 'For builders',
      priceMonthly: 1900,
      priceYearly: 1500,
      maxExportsPerMonth: 999999,
      maxPagesPerCrawl: 200,
      allowReact: true,
      allowApi: false,
      seats: 1,
      features: [
        'Unlimited exports',
        'Up to 200 pages per crawl',
        'HTML + React (Next.js) output',
        'Custom crawl depth & concurrency',
        'Priority email support',
      ],
      highlight: true,
      visible: true,
      sortOrder: 1,
    },
    {
      slug: 'studio',
      name: 'Studio',
      tagline: 'For teams',
      priceMonthly: 4900,
      priceYearly: 3900,
      maxExportsPerMonth: 999999,
      maxPagesPerCrawl: 500,
      allowReact: true,
      allowApi: true,
      seats: 5,
      features: [
        'Everything in Pro',
        'Team workspace (5 seats)',
        'API access',
        'Webhook notifications',
        'White-glove onboarding',
      ],
      highlight: false,
      visible: true,
      sortOrder: 2,
    },
  ];

  for (const p of plans) {
    await prisma.plan.upsert({
      where: { slug: p.slug },
      update: p,
      create: p,
    });
  }

  console.log('Seeded plans:', plans.map((p) => p.slug).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
