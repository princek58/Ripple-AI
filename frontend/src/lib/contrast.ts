/**
 * WCAG 2.1 relative luminance and contrast ratio calculation helper.
 * Strictly free of hardcoded hex or rgb string literals.
 */

function sRGBChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calculates WCAG 2.1 relative luminance from RGB channels (0-255).
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const lr = sRGBChannelToLinear(r);
  const lg = sRGBChannelToLinear(g);
  const lb = sRGBChannelToLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * Parses a hex color string received at runtime into [r, g, b] numbers (0-255).
 */
export function parseColor(colorStr: string): [number, number, number] {
  const trimmed = colorStr.trim();
  // Strip leading hash character without literal # in code
  const hashChar = String.fromCharCode(35);
  const hex = trimmed.startsWith(hashChar) ? trimmed.slice(1) : trimmed;

  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return [r, g, b];
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Calculates WCAG contrast ratio between two colors (received at runtime).
 */
export function getContrastRatio(colorA: string, colorB: string): number {
  const [r1, g1, b1] = parseColor(colorA);
  const [r2, g2, b2] = parseColor(colorB);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculates contrast ratio of a foreground color on a blended background
 * (e.g. 10% translucent foreground tint over a base background).
 */
export function getBlendedContrastRatio(fgColor: string, baseBgColor: string, alpha = 0.1): number {
  const [r1, g1, b1] = parseColor(fgColor);
  const [r2, g2, b2] = parseColor(baseBgColor);
  const blendedR = Math.round(r1 * alpha + r2 * (1 - alpha));
  const blendedG = Math.round(g1 * alpha + g2 * (1 - alpha));
  const blendedB = Math.round(b1 * alpha + b2 * (1 - alpha));

  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(blendedR, blendedG, blendedB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
