async function activate(ctx) {
  await ctx.content.types.register({
    slug: 'book',
    label: 'Books',
    singular: 'Book',
    supports: ['title', 'editor', 'excerpt'],
  });
  await ctx.content.taxonomies.register({
    slug: 'genre',
    label: 'Genres',
    postTypes: ['book'],
  });

  ctx.admin.addMetaBox({
    id: 'book-details',
    title: 'Book details',
    postTypes: ['book', 'post'],
    fields: [{ key: 'isbn', label: 'ISBN', type: 'text' }],
  });

  ctx.admin.addMenuPage({
    slug: 'books',
    title: 'Books',
    menuTitle: 'Books',
    screen: 'content',
    postType: 'book',
  });

  ctx.graphql.type('type BookCount { total: Int! }');
  ctx.graphql.query('bookCount', 'BookCount!', async () => {
    const rows = await ctx.content.query({ postType: 'book', limit: 50 });
    return { total: Array.isArray(rows) ? rows.length : 0 };
  });

  const job = await ctx.cron.schedule({ hook: 'recount', intervalSeconds: 86400 });
  ctx.hooks.addAction(job.hook, async () => {
    const books = await ctx.content.query({ postType: 'book', limit: 50 });
    ctx.logger.log(`Recounted ${books.length} books`);
  });
}

module.exports = { activate };
