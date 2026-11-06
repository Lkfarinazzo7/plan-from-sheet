/** Retorna true quando a data (YYYY-MM-DD) está mais de 1 ano antes ou depois de hoje (YYYY-MM-DD). */
export function dataDistanteDeHoje(data: string, hoje: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return false;
  const [y, m, d] = hoje.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const menos = `${y - 1}-${pad(m)}-${pad(d)}`;
  const mais = `${y + 1}-${pad(m)}-${pad(d)}`;
  return data < menos || data > mais;
}
