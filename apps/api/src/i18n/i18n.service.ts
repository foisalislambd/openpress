import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { GettextEntry, translate } from './gettext';
import { compileJsonCatalog, compileMo, parsePo } from './po';

@Injectable()
export class I18nService {
  constructor(private db: DbService) {}

  async catalog(locale?: string) {
    return this.db.query(
      `SELECT locale, "stringKey" AS key, value
       FROM i18n_strings
       WHERE ($1::text IS NULL OR locale = $1)
       ORDER BY locale, "stringKey"`,
      [locale ?? null],
    );
  }

  async upsert(locale: string, key: string, value: string) {
    const safeLocale = locale.trim().toLowerCase();
    const safeKey = key.trim();
    if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(safeLocale)) {
      throw new BadRequestException('Locale looks like en or en-gb');
    }
    if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(safeKey)) {
      throw new BadRequestException('String key uses letters, numbers, and .:_-');
    }
    await this.db.query(
      `INSERT INTO i18n_strings (locale, "stringKey", value)
       VALUES ($1, $2, $3)
       ON CONFLICT (locale, "stringKey") DO UPDATE SET value = EXCLUDED.value`,
      [safeLocale, safeKey, value],
    );
    return { locale: safeLocale, key: safeKey, value };
  }

  async messages(locale?: string) {
    return this.db.query<GettextEntry>(
      `SELECT locale, domain, context, msgid, "msgidPlural" AS "msgidPlural", msgstr, "msgstrPlural" AS "msgstrPlural"
       FROM gettext_entries
       WHERE ($1::text IS NULL OR locale = $1)
       ORDER BY locale, domain, msgid`,
      [locale ?? null],
    );
  }

  async saveMessage(input: GettextEntry) {
    const locale = input.locale.trim().toLowerCase();
    const domain = (input.domain || 'openpress').trim();
    const context = (input.context || '').trim();
    const msgid = input.msgid.trim();
    if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(locale)) throw new BadRequestException('Locale looks like en or en-gb');
    if (!/^[a-z0-9_-]{1,40}$/.test(domain)) throw new BadRequestException('Invalid text domain');
    if (!msgid || msgid.length > 500) throw new BadRequestException('msgid is required');
    await this.db.query(
      `INSERT INTO gettext_entries (locale, domain, context, msgid, "msgidPlural", msgstr, "msgstrPlural")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (locale, domain, context, msgid)
       DO UPDATE SET "msgidPlural" = EXCLUDED."msgidPlural", msgstr = EXCLUDED.msgstr, "msgstrPlural" = EXCLUDED."msgstrPlural"`,
      [locale, domain, context, msgid, input.msgidPlural ?? '', input.msgstr ?? '', input.msgstrPlural ?? ''],
    );
    return { locale, domain, context, msgid };
  }

  async compilePo(locale: string, domain: string, source: string) {
    if (source.length > 500_000) throw new BadRequestException('That catalog is too large');
    const messages = parsePo(source);
    for (const message of messages) {
      if (!message.msgid) continue;
      await this.saveMessage({
        locale,
        domain,
        context: message.context,
        msgid: message.msgid,
        msgidPlural: message.msgidPlural,
        msgstr: message.msgstr[0] ?? '',
        msgstrPlural: message.msgstr[1] ?? '',
      });
    }
    const json = compileJsonCatalog(locale, domain, messages);
    return {
      imported: messages.filter((message) => message.msgid).length,
      json,
      moBase64: compileMo(messages).toString('base64'),
    };
  }

  async translate(query: { locale: string; msgid: string; domain?: string; context?: string; count?: number }) {
    const rows = await this.messages(query.locale);
    return { text: translate(rows, query) };
  }

  async remove(locale: string, key: string) {
    await this.db.query('DELETE FROM i18n_strings WHERE locale = $1 AND "stringKey" = $2', [
      locale,
      key,
    ]);
    return { locale, key };
  }
}
