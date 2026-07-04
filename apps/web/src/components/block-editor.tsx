'use client';

import { useEffect, useMemo, useRef } from 'react';
import { BlockNoteEditor, PartialBlock } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

export function BlockEditor({
  initialBlocks,
  onChange,
}: {
  initialBlocks: unknown[];
  onChange: (blocks: unknown[]) => void;
}) {
  const initialContent = useMemo<PartialBlock[] | undefined>(
    () =>
      Array.isArray(initialBlocks) && initialBlocks.length > 0
        ? (initialBlocks as PartialBlock[])
        : undefined,
    // Editor is only initialised once; changing content later resets cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useCreateBlockNote({ initialContent });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    // Emit initial state so the parent always has valid blocks
    onChangeRef.current(editor.document);
  }, [editor]);

  return (
    <div className="min-h-[420px] rounded-xl border border-zinc-200 bg-white py-4">
      <BlockNoteView
        editor={editor as BlockNoteEditor}
        theme="light"
        onChange={() => onChangeRef.current(editor.document)}
      />
    </div>
  );
}
