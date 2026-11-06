'use client';

import { getBlockType } from '@openpress/shared';
import type { CanvasBlock } from './tree';

export function BlockInspector({
  block,
  onChange,
}: {
  block: CanvasBlock | null;
  onChange: (patch: Partial<CanvasBlock>) => void;
}) {
  if (!block) {
    return <p className="op-gb-panel" style={{ color: '#757575' }}>Select a block to see its settings.</p>;
  }
  const definition = getBlockType(block.type);
  const attributes = Object.entries(definition?.attributes ?? {});
  return (
    <div className="op-gb-panel">
      <p className="op-gb-label">{definition?.title ?? block.type}</p>
      <p style={{ marginTop: 0, color: '#757575' }}>{definition?.description}</p>
      {attributes.map(([key, attribute]) => (
        <label key={key} className="op-gb-field">
          {key.charAt(0).toUpperCase() + key.slice(1)}
          {attribute.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={Boolean(block.props[key] ?? attribute.default)}
              onChange={(event) => onChange({ props: { ...block.props, [key]: event.target.checked } })}
            />
          ) : attribute.type === 'number' ? (
            <input
              type="number"
              value={Number(block.props[key] ?? attribute.default ?? 0)}
              onChange={(event) => onChange({ props: { ...block.props, [key]: Number(event.target.value) } })}
            />
          ) : (
            <input
              type="text"
              value={String(block.props[key] ?? attribute.default ?? '')}
              onChange={(event) => onChange({ props: { ...block.props, [key]: event.target.value } })}
            />
          )}
        </label>
      ))}
      <p className="op-gb-cat">Advanced</p>
      <label className="op-gb-field">
        HTML anchor
        <input
          type="text"
          value={String(block.props.anchor ?? '')}
          onChange={(event) => onChange({ props: { ...block.props, anchor: event.target.value } })}
        />
      </label>
      <label className="op-gb-field">
        Additional CSS class(es)
        <input
          type="text"
          value={String(block.props.className ?? '')}
          onChange={(event) => onChange({ props: { ...block.props, className: event.target.value } })}
        />
      </label>
      {definition?.supports.align ? (
        <label className="op-gb-field">
          Alignment
          <select
            value={String(block.props.align ?? 'left')}
            onChange={(event) => onChange({ props: { ...block.props, align: event.target.value } })}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}
