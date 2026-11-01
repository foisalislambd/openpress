export interface SizeSpec {
  thumbnail: number;
  medium: number;
  large: number;
}

export function plannedSizes(originalWidth: number, widths: SizeSpec) {
  const planned: { name: keyof SizeSpec; width: number }[] = [];
  for (const name of ['thumbnail', 'medium', 'large'] as const) {
    const width = widths[name];
    if (Number.isFinite(width) && width > 0 && originalWidth > width) {
      planned.push({ name, width: Math.round(width) });
    }
  }
  return planned;
}

export function clampCrop(
  bounds: { width: number; height: number },
  crop: { x: number; y: number; width: number; height: number },
) {
  if (
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.x + crop.width > bounds.width ||
    crop.y + crop.height > bounds.height
  ) {
    return null;
  }
  return {
    left: Math.round(crop.x),
    top: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  };
}
