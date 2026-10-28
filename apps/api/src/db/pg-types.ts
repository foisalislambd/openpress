import { types } from 'pg';

// TIMESTAMP WITHOUT TIME ZONE is stored as UTC wall time. Parse it as UTC
// so API dates stay stable regardless of the machine timezone.
types.setTypeParser(1114, (value: string) => new Date(value.replace(' ', 'T') + 'Z'));
