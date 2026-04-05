export function renderTable(rows: string[][]): string {
  if (rows.length === 0) return '';

  const colWidths: number[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const stripped = row[i].replace(/\x1b\[[0-9;]*m/g, '');
      colWidths[i] = Math.max(colWidths[i] ?? 0, stripped.length);
    }
  }

  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const stripped = cell.replace(/\x1b\[[0-9;]*m/g, '');
          const padding = colWidths[i] - stripped.length;
          return cell + ' '.repeat(Math.max(0, padding));
        })
        .join('  ')
    )
    .join('\n');
}

export function progressBar(value: number, width: number = 20): string {
  const filled = Math.round((value / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}
