// Fractional vertical block characters, index 0 (empty) .. 8 (full).
const EIGHTHS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Render one vertical bar as `rows` single-character strings, ordered
 * top-to-bottom. The bar grows upward from the bottom row.
 */
export function columnCells(value: number, max: number, rows: number): string[] {
  if (max <= 0 || value <= 0) return Array<string>(rows).fill(" ");
  const eighths = Math.min(
    rows * 8,
    Math.max(1, Math.round((value / max) * rows * 8)),
  );
  const fullRows = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - 1 - r; // 0 = bottom row
    if (fromBottom < fullRows) cells.push("█");
    else if (fromBottom === fullRows && remainder > 0) cells.push(EIGHTHS[remainder]!);
    else cells.push(" ");
  }
  return cells;
}

/** Split a horizontal bar of `width` cells into filled and empty counts. */
export function barFill(
  value: number,
  max: number,
  width: number,
): { filled: number; empty: number } {
  if (max <= 0 || value <= 0) return { filled: 0, empty: width };
  const filled = Math.min(width, Math.max(1, Math.round((value / max) * width)));
  return { filled, empty: width - filled };
}
