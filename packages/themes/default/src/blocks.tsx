import React from 'react';

// Renders BlockNote-style block JSON into semantic HTML.
// Themes can override this to style blocks differently.

interface InlineNode {
  type: string;
  text?: string;
  href?: string;
  content?: InlineNode[];
  styles?: Record<string, boolean | string>;
}

export interface Block {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: InlineNode[] | { type: string; rows?: unknown[] };
  children?: Block[];
}

function renderInline(nodes: InlineNode[] | undefined, keyPrefix: string) {
  if (!Array.isArray(nodes)) return null;
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    if (node.type === 'link') {
      return (
        <a key={key} href={node.href} className="op-link">
          {renderInline(node.content, key)}
        </a>
      );
    }
    let el: React.ReactNode = node.text ?? '';
    const s = node.styles ?? {};
    if (s.code) el = <code>{el}</code>;
    if (s.bold) el = <strong>{el}</strong>;
    if (s.italic) el = <em>{el}</em>;
    if (s.underline) el = <u>{el}</u>;
    if (s.strike) el = <s>{el}</s>;
    return <React.Fragment key={key}>{el}</React.Fragment>;
  });
}

function BlockView({ block }: { block: Block }) {
  const key = block.id ?? Math.random().toString(36);
  const inline = Array.isArray(block.content)
    ? renderInline(block.content, key)
    : null;
  const children = block.children?.length ? (
    <BlockList blocks={block.children} />
  ) : null;

  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(block.props?.level ?? 2)));
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      return <Tag>{inline}</Tag>;
    }
    case 'bulletListItem':
      return (
        <ul>
          <li>
            {inline}
            {children}
          </li>
        </ul>
      );
    case 'numberedListItem':
      return (
        <ol>
          <li>
            {inline}
            {children}
          </li>
        </ol>
      );
    case 'checkListItem':
      return (
        <div className="op-checkitem">
          <input type="checkbox" disabled checked={Boolean(block.props?.checked)} />
          <span>{inline}</span>
        </div>
      );
    case 'quote':
      return <blockquote>{inline}</blockquote>;
    case 'codeBlock':
      return (
        <pre>
          <code>
            {Array.isArray(block.content)
              ? block.content.map((c) => c.text ?? '').join('')
              : ''}
          </code>
        </pre>
      );
    case 'image':
      return (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={String(block.props?.url ?? '')}
            alt={String(block.props?.caption ?? '')}
          />
          {block.props?.caption ? (
            <figcaption>{String(block.props.caption)}</figcaption>
          ) : null}
        </figure>
      );
    case 'paragraph':
    default:
      return (
        <>
          <p>{inline}</p>
          {children}
        </>
      );
  }
}

export function BlockList({ blocks }: { blocks: Block[] }) {
  if (!Array.isArray(blocks)) return null;
  return (
    <>
      {blocks.map((block, i) => (
        <BlockView key={block.id ?? i} block={block} />
      ))}
    </>
  );
}

export function BlockRenderer({ blocks }: { blocks: unknown }) {
  return (
    <div className="op-prose">
      <BlockList blocks={(blocks as Block[]) ?? []} />
    </div>
  );
}
