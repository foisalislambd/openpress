/** Parse a gettext .po file and compile it to a JSON catalog and a .mo buffer. */

export interface PoMessage {
  context: string;
  msgid: string;
  msgidPlural: string;
  msgstr: string[];
}

export function parsePo(source: string): PoMessage[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const messages: PoMessage[] = [];
  let context = '';
  let msgid: string[] = [];
  let msgidPlural: string[] = [];
  let msgstr: string[][] = [];
  let mode: 'none' | 'ctxt' | 'id' | 'plural' | 'str' = 'none';
  let index = 0;

  const flush = () => {
    const id = msgid.join('');
    if (!id && !context && msgstr.every((part) => !part.join(''))) {
      context = '';
      msgid = [];
      msgidPlural = [];
      msgstr = [];
      return;
    }
    messages.push({
      context,
      msgid: id,
      msgidPlural: msgidPlural.join(''),
      msgstr: msgstr.map((part) => part.join('')),
    });
    context = '';
    msgid = [];
    msgidPlural = [];
    msgstr = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const quoted = /^(\w+(?:\[\d+\])?)\s+"(.*)"$/.exec(line);
    const continuation = /^"(.*)"$/.exec(line);
    if (quoted) {
      const [, key, value] = quoted;
      const decoded = unescapePo(value);
      if (key === 'msgctxt') {
        if (msgid.length || msgstr.length) flush();
        mode = 'ctxt';
        context = decoded;
      } else if (key === 'msgid') {
        if (msgid.length || msgstr.length) flush();
        mode = 'id';
        msgid = [decoded];
      } else if (key === 'msgid_plural') {
        mode = 'plural';
        msgidPlural = [decoded];
      } else if (key.startsWith('msgstr')) {
        mode = 'str';
        index = Number(/\[(\d+)\]/.exec(key)?.[1] ?? 0);
        msgstr[index] = [decoded];
      }
    } else if (continuation && mode !== 'none') {
      const decoded = unescapePo(continuation[1]);
      if (mode === 'ctxt') context += decoded;
      else if (mode === 'id') msgid.push(decoded);
      else if (mode === 'plural') msgidPlural.push(decoded);
      else msgstr[index].push(decoded);
    } else if (!line.startsWith('"')) {
      flush();
      mode = 'none';
    }
  }
  flush();
  return messages.filter((message) => message.msgid || message.msgstr.some(Boolean));
}

export function compileJsonCatalog(locale: string, domain: string, messages: readonly PoMessage[]) {
  const translations: Record<string, Record<string, { msgstr: string[] }>> = {};
  for (const message of messages) {
    const bucket = translations[message.context] ?? {};
    bucket[message.msgid] = { msgstr: message.msgstr.length ? message.msgstr : [''] };
    translations[message.context] = bucket;
  }
  return { locale, domain, translations };
}

export function compileMo(messages: readonly PoMessage[]) {
  const header = messages.find((message) => message.msgid === '') ?? {
    context: '',
    msgid: '',
    msgidPlural: '',
    msgstr: ['Content-Type: text/plain; charset=UTF-8\n'],
  };
  const rows = [header, ...messages.filter((message) => message !== header && message.msgid)];
  const originals = rows.map((message) => message.context ? `${message.context}\u0004${message.msgid}` : message.msgid);
  const translations = rows.map((message) => {
    const forms = message.msgstr.length ? message.msgstr : [''];
    return message.msgidPlural ? forms.join('\u0000') : forms[0] ?? '';
  });
  return writeMo(originals, translations);
}

function writeMo(originals: string[], translations: string[]) {
  const count = originals.length;
  const headerSize = 28;
  const tableSize = count * 8 * 2;
  let offset = headerSize + tableSize;
  const originalMeta: { length: number; offset: number }[] = [];
  const translationMeta: { length: number; offset: number }[] = [];
  const blobs: Buffer[] = [];
  for (const value of originals) {
    const bytes = Buffer.from(`${value}\u0000`, 'utf8');
    originalMeta.push({ length: Buffer.byteLength(value), offset });
    blobs.push(bytes);
    offset += bytes.length;
  }
  for (const value of translations) {
    const bytes = Buffer.from(`${value}\u0000`, 'utf8');
    translationMeta.push({ length: Buffer.byteLength(value), offset });
    blobs.push(bytes);
    offset += bytes.length;
  }
  const file = Buffer.alloc(offset);
  file.writeUInt32LE(0x950412de, 0);
  file.writeUInt32LE(0, 4);
  file.writeUInt32LE(count, 8);
  file.writeUInt32LE(headerSize, 12);
  file.writeUInt32LE(headerSize + count * 8, 16);
  file.writeUInt32LE(0, 20);
  file.writeUInt32LE(0, 24);
  originalMeta.forEach((item, index) => {
    const at = headerSize + index * 8;
    file.writeUInt32LE(item.length, at);
    file.writeUInt32LE(item.offset, at + 4);
  });
  translationMeta.forEach((item, index) => {
    const at = headerSize + count * 8 + index * 8;
    file.writeUInt32LE(item.length, at);
    file.writeUInt32LE(item.offset, at + 4);
  });
  let cursor = headerSize + tableSize;
  for (const blob of blobs) {
    blob.copy(file, cursor);
    cursor += blob.length;
  }
  return file;
}

export function readMoHeader(buffer: Buffer) {
  if (buffer.length < 20) return null;
  const magic = buffer.readUInt32LE(0);
  return { magic, count: buffer.readUInt32LE(8) };
}

function unescapePo(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
