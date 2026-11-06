import { kses } from '../html/kses';

/** Core widget definitions. Plugin widgets stay strings rendered by their own code. */

export const CORE_WIDGETS = [
  { type: 'search', title: 'Search' },
  { type: 'recent-posts', title: 'Recent Posts' },
  { type: 'categories', title: 'Categories' },
  { type: 'text', title: 'Text' },
] as const;

export type CoreWidgetType = (typeof CORE_WIDGETS)[number]['type'];

export interface WidgetView {
  id: string;
  type: string;
  title: string;
  text?: string;
  items?: { label: string; href: string }[];
  form?: { action: string; name: string; placeholder: string };
}

export function isCoreWidget(type: string): type is CoreWidgetType {
  return CORE_WIDGETS.some((widget) => widget.type === type);
}

export function coreWidgetView(
  instance: { id: string; type: string; settings: Record<string, unknown> },
  data: {
    posts?: { title: string; slug: string }[];
    categories?: { name: string; slug: string }[];
  },
): WidgetView | null {
  if (!isCoreWidget(instance.type)) return null;
  const title = stringSetting(instance.settings.title) || defaultTitle(instance.type);
  if (instance.type === 'search') {
    return {
      id: instance.id,
      type: instance.type,
      title,
      form: { action: '/search', name: 'q', placeholder: 'Search' },
    };
  }
  if (instance.type === 'recent-posts') {
    return {
      id: instance.id,
      type: instance.type,
      title,
      items: (data.posts ?? []).map((post) => ({ label: post.title, href: `/${post.slug}` })),
    };
  }
  if (instance.type === 'categories') {
    return {
      id: instance.id,
      type: instance.type,
      title,
      items: (data.categories ?? []).map((category) => ({
        label: category.name,
        href: `/category/${category.slug}`,
      })),
    };
  }
  return {
    id: instance.id,
    type: instance.type,
    title,
    text: stringSetting(instance.settings.text),
  };
}

export function widgetPlainText(view: WidgetView) {
  const lines = [view.title];
  if (view.form) lines.push(`Search at ${view.form.action}`);
  if (view.text) lines.push(view.text);
  for (const item of view.items ?? []) lines.push(`${item.label} (${item.href})`);
  return lines.join('\n');
}

export function sanitizeWidgetSettings(type: string, settings: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  const title = stringSetting(settings.title).slice(0, 120);
  if (title) next.title = title;
  if (type === 'text' || type.includes('/')) {
    const text = kses(stringSetting(settings.text)).slice(0, 5000);
    if (text) next.text = text;
  }
  return next;
}

function defaultTitle(type: CoreWidgetType) {
  return CORE_WIDGETS.find((widget) => widget.type === type)?.title ?? 'Widget';
}

function stringSetting(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
