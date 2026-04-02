export function parseValorBR(raw: any): number {
  let str = String(raw ?? '').trim();
  str = str.replace(/^R\$\s*/, '').replace(/\s/g, '');
  // If has both dot and comma, figure out which is decimal separator
  if (str.includes(',') && str.includes('.')) {
    // Brazilian: 1.234,56
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    }
    // English: 1,234.56 — just remove commas
    else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  return parseFloat(str);
}

export function parseDateFlexible(value: any): string {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  const str = String(value).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // M/D/YY or M/D/YYYY (Excel US format)
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) {
    const [m, d, y] = str.split('/');
    const fullYear = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y;
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
}

/**
 * Auto-map expected field names to detected columns.
 * Uses fuzzy/alias matching.
 */
export function autoMapColumns(
  expectedColumns: string[],
  detectedHeaders: string[],
  aliases?: Record<string, string[]>
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const defaultAliases: Record<string, string[]> = {
    'Valor': ['Valor Real', 'Valor (R$)'],
    'Vendedor': ['Responsável', 'Responsavel'],
    'Tipo': ['Tipo (Fixo/Variável)', 'Tipo (Fixo/Variavel)'],
    'Status': ['Status/Pago'],
    'Descrição': ['Descricao', 'Descrição'],
    ...aliases,
  };

  for (const expected of expectedColumns) {
    // Exact match
    const exact = detectedHeaders.find(h => h.toLowerCase() === expected.toLowerCase());
    if (exact) { mapping[expected] = exact; continue; }
    // Alias match
    const aliasList = defaultAliases[expected] || [];
    const aliasMatch = detectedHeaders.find(h => aliasList.some(a => h.toLowerCase() === a.toLowerCase()));
    if (aliasMatch) { mapping[expected] = aliasMatch; continue; }
    // Partial match
    const partial = detectedHeaders.find(h => h.toLowerCase().includes(expected.toLowerCase()) || expected.toLowerCase().includes(h.toLowerCase()));
    if (partial) { mapping[expected] = partial; continue; }
    mapping[expected] = '';
  }
  return mapping;
}
