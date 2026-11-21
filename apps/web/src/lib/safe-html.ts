/** JSON for a script tag. `<` inside a string must not close the surrounding script. */
export function jsonForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function safeCss(css: unknown) {
  return String(css ?? '')
    .replace(/<\/style/gi, '')
    .replace(/@import[^;]+;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .slice(0, 20000);
}
