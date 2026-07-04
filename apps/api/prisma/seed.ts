import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const welcomeBlocks = [
  {
    id: 'b1',
    type: 'heading',
    props: { level: 2 },
    content: [{ type: 'text', text: 'Welcome to OpenPress', styles: {} }],
    children: [],
  },
  {
    id: 'b2',
    type: 'paragraph',
    props: {},
    content: [
      {
        type: 'text',
        text: 'OpenPress is a modern, open-source alternative to WordPress built with NestJS, Next.js and PostgreSQL. Edit or delete this post from the admin panel, then start writing!',
        styles: {},
      },
    ],
    children: [],
  },
  {
    id: 'b3',
    type: 'paragraph',
    props: {},
    content: [
      {
        type: 'text',
        text: 'It ships with a block editor, media library, categories, tags, comments and a component-based theme system.',
        styles: {},
      },
    ],
    children: [],
  },
];

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@openpress.local' },
    update: {},
    create: {
      email: 'admin@openpress.local',
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash('admin12345', 10),
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: 'general' },
    update: {},
    create: { name: 'General', slug: 'general', description: 'General posts' },
  });

  const tag = await prisma.tag.upsert({
    where: { slug: 'getting-started' },
    update: {},
    create: { name: 'Getting Started', slug: 'getting-started' },
  });

  await prisma.content.upsert({
    where: { slug: 'hello-openpress' },
    update: {},
    create: {
      title: 'Hello OpenPress',
      slug: 'hello-openpress',
      type: 'POST',
      status: 'PUBLISHED',
      excerpt: 'Your first post on OpenPress — a modern WordPress alternative.',
      blocks: welcomeBlocks,
      publishedAt: new Date(),
      authorId: admin.id,
      categories: { connect: { id: category.id } },
      tags: { connect: { id: tag.id } },
    },
  });

  await prisma.content.upsert({
    where: { slug: 'about' },
    update: {},
    create: {
      title: 'About',
      slug: 'about',
      type: 'PAGE',
      status: 'PUBLISHED',
      excerpt: 'About this site',
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          props: {},
          content: [
            {
              type: 'text',
              text: 'This site is powered by OpenPress, an open-source CMS.',
              styles: {},
            },
          ],
          children: [],
        },
      ],
      publishedAt: new Date(),
      authorId: admin.id,
    },
  });

  console.log('Seed complete. Admin login: admin@openpress.local / admin12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
