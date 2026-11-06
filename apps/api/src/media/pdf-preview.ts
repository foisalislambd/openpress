/** Arguments for Poppler. The first page only, scaled so the thumbnail is not a full print render. */
export function pdfPreviewArgs(input: string, outputPrefix: string) {
  return ['-png', '-f', '1', '-l', '1', '-singlefile', '-scale-to', '1024', input, outputPrefix];
}
