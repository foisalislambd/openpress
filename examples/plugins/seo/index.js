function activate(ctx) {
  ctx.lifecycle.onInstall(() => {
    ctx.logger.log('SEO plugin installed');
  });

  ctx.admin.addMenuPage({
    slug: 'seo',
    title: 'SEO',
    menuTitle: 'SEO',
    fields: [
      { key: 'titleSuffix', label: 'Title suffix', type: 'text' },
      { key: 'description', label: 'Default description', type: 'textarea' },
    ],
  });

  ctx.admin.notice({ type: 'info', message: 'SEO is adding a title suffix on the public site.' });

  ctx.hooks.addFilter('document_title', async (title) => {
    const settings = await ctx.settings.get();
    const suffix = settings.titleSuffix ? ` ${settings.titleSuffix}` : '';
    return `${title}${suffix}`;
  });

  ctx.hooks.addFilter('the_excerpt', async (excerpt) => {
    if (excerpt) return excerpt;
    const settings = await ctx.settings.get();
    return settings.description || excerpt;
  });

  ctx.hooks.addFilter('wp_head', async (tags) => {
    const settings = await ctx.settings.get();
    const next = Array.isArray(tags) ? tags.slice() : [];
    if (settings.description) {
      next.push(`<meta name="description" content="${String(settings.description).replace(/"/g, '')}">`);
    }
    return next;
  });

  ctx.blocks.register({
    name: 'seo/note',
    title: 'SEO note',
    description: 'A short note rendered on the public page.',
    attributes: [{ key: 'text', type: 'string', label: 'Text' }],
    render: (props) => String(props.text || ''),
  });

  ctx.i18n.load({ locale: 'en', messages: { 'Read more': 'Read more' } });
}

module.exports = { activate };
