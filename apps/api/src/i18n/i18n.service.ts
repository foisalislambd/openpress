import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

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

  async remove(locale: string, key: string) {
    await this.db.query('DELETE FROM i18n_strings WHERE locale = $1 AND "stringKey" = $2', [
      locale,
      key,
    ]);
    return { locale, key };
  }
}
