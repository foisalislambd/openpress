function pgCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

export function isUniqueViolation(error: unknown) {
  return pgCode(error) === '23505';
}

export function isForeignKeyViolation(error: unknown) {
  return pgCode(error) === '23503';
}
