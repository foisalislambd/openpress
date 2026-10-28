import * as bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { loadEnv } from './env';
import '../src/db/pg-types';

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env');
  process.exit(1);
}

const pool = new Pool({ connectionString, options: '-c timezone=UTC' });

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

const aboutBlocks = [
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
];

async function main() {
  const passwordHash = await bcrypt.hash('admin12345', 10);
  const admin = await pool.query<{ id: string }>(
    `INSERT INTO users (id, email, name, role, "passwordHash", "updatedAt")
     VALUES ($1, $2, $3, 'ADMIN', $4, now())
     ON CONFLICT (email) DO UPDATE SET email = users.email
     RETURNING id`,
    [randomUUID(), 'admin@openpress.local', 'Admin', passwordHash],
  );
  const adminId = admin.rows[0].id;

  const category = await pool.query<{ id: string }>(
    `INSERT INTO categories (id, name, slug, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET slug = categories.slug
     RETURNING id`,
    [randomUUID(), 'General', 'general', 'General posts'],
  );
  const categoryId = category.rows[0].id;

  const tag = await pool.query<{ id: string }>(
    `INSERT INTO tags (id, name, slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET slug = tags.slug
     RETURNING id`,
    [randomUUID(), 'Getting Started', 'getting-started'],
  );
  const tagId = tag.rows[0].id;

  const post = await pool.query<{ id: string }>(
    `INSERT INTO contents (
       id, type, status, title, slug, excerpt, blocks, seo,
       "publishedAt", "authorId", "updatedAt"
     ) VALUES (
       $1, 'POST', 'PUBLISHED', $2, $3, $4, $5::jsonb, '{}'::jsonb,
       now(), $6, now()
     )
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      'Hello OpenPress',
      'hello-openpress',
      'Your first post on OpenPress — a modern WordPress alternative.',
      JSON.stringify(welcomeBlocks),
      adminId,
    ],
  );
  if (post.rows[0]) {
    await pool.query(
      `INSERT INTO "_ContentCategories" ("A", "B") VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [categoryId, post.rows[0].id],
    );
    await pool.query(
      `INSERT INTO "_ContentTags" ("A", "B") VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [post.rows[0].id, tagId],
    );
  }

  await pool.query(
    `INSERT INTO contents (
       id, type, status, title, slug, excerpt, blocks, seo,
       "publishedAt", "authorId", "updatedAt"
     ) VALUES (
       $1, 'PAGE', 'PUBLISHED', $2, $3, $4, $5::jsonb, '{}'::jsonb,
       now(), $6, now()
     )
     ON CONFLICT (slug) DO NOTHING`,
    [
      randomUUID(),
      'About',
      'about',
      'About this site',
      JSON.stringify(aboutBlocks),
      adminId,
    ],
  );

  console.log('Seed complete. Admin login: admin@openpress.local / admin12345');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => pool.end());
