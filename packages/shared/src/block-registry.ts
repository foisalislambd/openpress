/**
 * Client and server block catalog, analogous to registerBlockType.
 * Edit and save implementations live next to the editor and the API.
 * Storage stays the OpenPress BlockNode JSON (not WordPress HTML comments).
 */

export type BlockCategory = 'text' | 'media' | 'design' | 'widgets' | 'embeds';

export type BlockEdit =
  | 'text'
  | 'url'
  | 'media'
  | 'html'
  | 'table'
  | 'container'
  | 'spacer'
  | 'separator';

export interface BlockAttribute {
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
}

export interface BlockDefinition {
  name: string;
  title: string;
  category: BlockCategory;
  icon: string;
  description: string;
  keywords: string[];
  attributes: Record<string, BlockAttribute>;
  supports: { text?: boolean; align?: boolean; children?: boolean };
  edit: BlockEdit;
  inserter: boolean;
  transforms: string[];
}

export const BLOCK_CATEGORIES: { name: BlockCategory; title: string }[] = [
  { name: 'text', title: 'Text' },
  { name: 'media', title: 'Media' },
  { name: 'design', title: 'Design' },
  { name: 'widgets', title: 'Widgets' },
  { name: 'embeds', title: 'Embeds' },
];

const registry = new Map<string, BlockDefinition>();

export function registerBlockType(definition: BlockDefinition) {
  if (registry.has(definition.name)) return registry.get(definition.name)!;
  registry.set(definition.name, definition);
  return definition;
}

export function getBlockType(name: string) {
  return registry.get(name);
}

export function getBlockTypes() {
  return [...registry.values()];
}

const textTransforms = ['paragraph', 'heading', 'quote', 'pullquote', 'verse', 'preformatted', 'codeBlock', 'list'];

function textBlock(
  partial: Pick<BlockDefinition, 'name' | 'title' | 'category' | 'icon' | 'description' | 'keywords' | 'attributes'> &
    Partial<Pick<BlockDefinition, 'supports' | 'transforms' | 'inserter'>>,
): BlockDefinition {
  return {
    name: partial.name,
    title: partial.title,
    category: partial.category,
    icon: partial.icon,
    description: partial.description,
    keywords: partial.keywords,
    attributes: partial.attributes,
    inserter: partial.inserter ?? true,
    edit: 'text',
    supports: partial.supports ?? { text: true, align: true },
    transforms: partial.transforms ?? textTransforms,
  };
}

const CORE: BlockDefinition[] = [
  textBlock({
    name: 'paragraph',
    title: 'Paragraph',
    category: 'text',
    icon: 'editor-paragraph',
    description: 'Start with the building block of all narrative.',
    keywords: ['text'],
    attributes: {},
  }),
  textBlock({
    name: 'heading',
    title: 'Heading',
    category: 'text',
    icon: 'heading',
    description: 'Introduce new sections and organize content.',
    keywords: ['title', 'subtitle'],
    attributes: { level: { type: 'number', default: 2 } },
  }),
  {
    name: 'list',
    title: 'List',
    category: 'text',
    icon: 'editor-ul',
    description: 'Create a bulleted or numbered list.',
    keywords: ['bullet', 'ordered', 'numbered'],
    attributes: { ordered: { type: 'boolean', default: false } },
    supports: { children: true },
    edit: 'container',
    inserter: true,
    transforms: textTransforms,
  },
  textBlock({
    name: 'bulletListItem',
    title: 'List item',
    category: 'text',
    icon: 'editor-ul',
    description: 'A single item in a list.',
    keywords: ['li'],
    attributes: {},
    inserter: false,
    transforms: [],
  }),
  textBlock({
    name: 'numberedListItem',
    title: 'Numbered list item',
    category: 'text',
    icon: 'editor-ol',
    description: 'A single item in a numbered list.',
    keywords: ['ol'],
    attributes: {},
    inserter: false,
    transforms: [],
  }),
  textBlock({
    name: 'checkListItem',
    title: 'Check list item',
    category: 'text',
    icon: 'yes',
    description: 'A checkable list item from older documents.',
    keywords: [],
    attributes: { checked: { type: 'boolean', default: false } },
    inserter: false,
    transforms: [],
  }),
  textBlock({
    name: 'toggleListItem',
    title: 'Toggle list item',
    category: 'text',
    icon: 'arrow-down',
    description: 'A collapsible list item from older documents.',
    keywords: [],
    attributes: {},
    inserter: false,
    transforms: [],
  }),
  textBlock({
    name: 'quote',
    title: 'Quote',
    category: 'text',
    icon: 'editor-quote',
    description: 'Give quoted text visual emphasis.',
    keywords: ['blockquote'],
    attributes: { citation: { type: 'string', default: '' } },
  }),
  textBlock({
    name: 'pullquote',
    title: 'Pullquote',
    category: 'text',
    icon: 'editor-quote',
    description: 'Highlight a quote from the text.',
    keywords: ['quote'],
    attributes: { citation: { type: 'string', default: '' } },
  }),
  textBlock({
    name: 'verse',
    title: 'Verse',
    category: 'text',
    icon: 'editor-textcolor',
    description: 'Insert poetry. Keep spacing and line breaks.',
    keywords: ['poetry'],
    attributes: {},
  }),
  textBlock({
    name: 'preformatted',
    title: 'Preformatted',
    category: 'text',
    icon: 'editor-code',
    description: 'Add text that respects spacing and tabs.',
    keywords: ['pre'],
    attributes: {},
  }),
  textBlock({
    name: 'codeBlock',
    title: 'Code',
    category: 'text',
    icon: 'editor-code',
    description: 'Display code snippets.',
    keywords: ['source'],
    attributes: { language: { type: 'string', default: '' } },
    supports: { text: true },
  }),
  {
    name: 'image',
    title: 'Image',
    category: 'media',
    icon: 'format-image',
    description: 'Insert an image to make a visual statement.',
    keywords: ['photo', 'picture'],
    attributes: {
      url: { type: 'string', default: '' },
      alt: { type: 'string', default: '' },
      caption: { type: 'string', default: '' },
    },
    supports: { align: true },
    edit: 'media',
    inserter: true,
    transforms: [],
  },
  {
    name: 'gallery',
    title: 'Gallery',
    category: 'media',
    icon: 'format-gallery',
    description: 'Display multiple images in a gallery.',
    keywords: ['images', 'photos'],
    attributes: { columns: { type: 'number', default: 3 } },
    supports: { children: true },
    edit: 'container',
    inserter: true,
    transforms: [],
  },
  {
    name: 'cover',
    title: 'Cover',
    category: 'media',
    icon: 'format-image',
    description: 'Add an image with a text overlay.',
    keywords: ['banner', 'hero'],
    attributes: {
      url: { type: 'string', default: '' },
      dim: { type: 'number', default: 50 },
    },
    supports: { text: true, align: true, children: true },
    edit: 'media',
    inserter: true,
    transforms: [],
  },
  {
    name: 'video',
    title: 'Video',
    category: 'media',
    icon: 'video-alt3',
    description: 'Embed a video from the media library or a URL.',
    keywords: ['movie'],
    attributes: { url: { type: 'string', default: '' }, caption: { type: 'string', default: '' } },
    supports: {},
    edit: 'url',
    inserter: true,
    transforms: [],
  },
  {
    name: 'audio',
    title: 'Audio',
    category: 'media',
    icon: 'format-audio',
    description: 'Embed a simple audio player.',
    keywords: ['music', 'sound'],
    attributes: { url: { type: 'string', default: '' }, caption: { type: 'string', default: '' } },
    supports: {},
    edit: 'url',
    inserter: true,
    transforms: [],
  },
  {
    name: 'file',
    title: 'File',
    category: 'media',
    icon: 'media-document',
    description: 'Add a link to a downloadable file.',
    keywords: ['download', 'pdf'],
    attributes: { url: { type: 'string', default: '' }, label: { type: 'string', default: 'Download' } },
    supports: {},
    edit: 'url',
    inserter: true,
    transforms: [],
  },
  {
    name: 'columns',
    title: 'Columns',
    category: 'design',
    icon: 'columns',
    description: 'Display content in multiple columns.',
    keywords: ['row', 'layout'],
    attributes: {},
    supports: { children: true },
    edit: 'container',
    inserter: true,
    transforms: [],
  },
  {
    name: 'column',
    title: 'Column',
    category: 'design',
    icon: 'columns',
    description: 'A single column.',
    keywords: [],
    attributes: {},
    supports: { text: true, children: true },
    edit: 'container',
    inserter: false,
    transforms: [],
  },
  {
    name: 'group',
    title: 'Group',
    category: 'design',
    icon: 'screenoptions',
    description: 'Gather blocks in a container.',
    keywords: ['container', 'section'],
    attributes: {},
    supports: { text: true, align: true, children: true },
    edit: 'container',
    inserter: true,
    transforms: [],
  },
  {
    name: 'buttons',
    title: 'Buttons',
    category: 'design',
    icon: 'button',
    description: 'Prompt visitors to take action with a group of buttons.',
    keywords: ['link', 'cta'],
    attributes: {},
    supports: { children: true },
    edit: 'container',
    inserter: true,
    transforms: [],
  },
  {
    name: 'button',
    title: 'Button',
    category: 'design',
    icon: 'button',
    description: 'Prompt visitors to take action with a button-style link.',
    keywords: ['link', 'cta'],
    attributes: {
      label: { type: 'string', default: 'Button' },
      url: { type: 'string', default: '' },
    },
    supports: { align: true },
    edit: 'url',
    inserter: true,
    transforms: [],
  },
  {
    name: 'separator',
    title: 'Separator',
    category: 'design',
    icon: 'minus',
    description: 'Create a break between ideas.',
    keywords: ['hr', 'divider'],
    attributes: {},
    supports: {},
    edit: 'separator',
    inserter: true,
    transforms: [],
  },
  {
    name: 'spacer',
    title: 'Spacer',
    category: 'design',
    icon: 'image-flip-vertical',
    description: 'Add white space between blocks.',
    keywords: ['gap'],
    attributes: { height: { type: 'number', default: 48 } },
    supports: {},
    edit: 'spacer',
    inserter: true,
    transforms: [],
  },
  {
    name: 'table',
    title: 'Table',
    category: 'text',
    icon: 'editor-table',
    description: 'Insert a table.',
    keywords: ['rows', 'columns'],
    attributes: { rows: { type: 'string', default: '[["",""],["",""]]' } },
    supports: {},
    edit: 'table',
    inserter: true,
    transforms: [],
  },
  {
    name: 'html',
    title: 'Custom HTML',
    category: 'widgets',
    icon: 'editor-code',
    description: 'Add custom HTML. The server keeps a small set of safe tags.',
    keywords: ['embed', 'code'],
    attributes: { html: { type: 'string', default: '' } },
    supports: {},
    edit: 'html',
    inserter: true,
    transforms: [],
  },
  {
    name: 'embed',
    title: 'Embed',
    category: 'embeds',
    icon: 'embed-generic',
    description: 'Add a link to embedded content.',
    keywords: ['youtube', 'twitter', 'url'],
    attributes: { url: { type: 'string', default: '' } },
    supports: {},
    edit: 'url',
    inserter: true,
    transforms: [],
  },
  {
    name: 'reusable',
    title: 'Reusable block',
    category: 'design',
    icon: 'controls-repeat',
    description: 'A saved block reference.',
    keywords: [],
    attributes: { ref: { type: 'string', default: '' } },
    supports: { children: true },
    edit: 'container',
    inserter: false,
    transforms: [],
  },
  {
    name: 'pluginBlock',
    title: 'Plugin block',
    category: 'widgets',
    icon: 'admin-plugins',
    description: 'A block registered by a plugin.',
    keywords: [],
    attributes: { name: { type: 'string', default: '' }, title: { type: 'string', default: '' } },
    supports: {},
    edit: 'url',
    inserter: false,
    transforms: [],
  },
];

for (const definition of CORE) registerBlockType(definition);
