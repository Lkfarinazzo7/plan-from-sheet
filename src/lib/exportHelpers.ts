export async function exportToExcel(data: Record<string, any>[], filename: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
