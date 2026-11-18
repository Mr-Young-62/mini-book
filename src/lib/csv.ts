// Shared CSV helpers.
//
// Two problems this solves:
// 1. `encodeURI` leaves `#` intact, so a value such as "C# Programming" is
//    treated as a URL fragment and truncates the downloaded file.
// 2. Unescaped quotes and spreadsheet formulas can corrupt or execute cells.

const FORMULA_PREFIX = /^\s*[=+\-@]/;

export function escapeCsvValue(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);

  // Prefix user-controlled values that a spreadsheet could treat as a formula.
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n');
}

export function downloadCsv(
  filename: string,
  headers: readonly unknown[],
  rows: readonly (readonly unknown[])[],
): void {
  // The BOM keeps Excel from misreading UTF-8 characters.
  const csv = `\uFEFF${buildCsv(headers, rows)}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
