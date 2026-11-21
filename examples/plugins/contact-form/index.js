function activate(ctx) {
  ctx.data.define({
    name: 'entries',
    fields: {
      name: { type: 'string', required: true, max: 80 },
      email: { type: 'string', required: true, max: 200 },
      message: { type: 'text', required: true, max: 5000 },
      status: { type: 'string', values: ['new', 'read'], required: true },
    },
  });

  ctx.migrations.add('1.0.0', () => {
    ctx.logger.log('Contact form storage is ready');
  });

  ctx.admin.addMenuPage({
    slug: 'entries',
    title: 'Form entries',
    menuTitle: 'Entries',
    screen: 'list',
    collection: 'entries',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
    ],
  });

  ctx.admin.addMenuPage({
    slug: 'inbox',
    title: 'Inbox',
    menuTitle: 'Inbox',
    screen: 'app',
    entry: 'admin/inbox.html',
  });

  ctx.forms.register({
    id: 'contact',
    title: 'Contact',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'message', label: 'Message', type: 'textarea' },
    ],
    onSubmit: (values) => ctx.data.insert('entries', {
      name: String(values.name || '').slice(0, 80),
      email: String(values.email || '').slice(0, 200),
      message: String(values.message || '').slice(0, 5000),
      status: 'new',
    }),
  });

  ctx.shortcodes.add('contact_form', () => 'Send a note to /api/plugins/contact-form/forms/contact');

  ctx.rest.route('GET', '/entries', async () => {
    const items = await ctx.data.find('entries', { limit: 50 });
    return { items };
  }, { auth: true });

  ctx.rest.route('POST', '/entries', async (req) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const record = await ctx.data.insert('entries', {
      name: String(body.name || '').slice(0, 80),
      email: String(body.email || '').slice(0, 200),
      message: String(body.message || '').slice(0, 5000),
      status: 'new',
    });
    return { id: record.id, received: true };
  });
}

module.exports = { activate };
