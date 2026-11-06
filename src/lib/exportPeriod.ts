const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const pad = (n: number) => String(n).padStart(2, '0');

/** month is 0-based. Returns YYYY-MM-DD strings without any UTC conversion. */
export function periodRange(fromMonth: number, fromYear: number, toMonth: number, toYear: number) {
  const lastDay = new Date(toYear, toMonth + 1, 0).getDate();
  return {
    start: `${fromYear}-${pad(fromMonth + 1)}-01`,
    end: `${toYear}-${pad(toMonth + 1)}-${pad(lastDay)}`,
  };
}

export function periodLabel(fromMonth: number, fromYear: number, toMonth: number, toYear: number) {
  const a = `${MESES[fromMonth]}-${fromYear}`;
  const b = `${MESES[toMonth]}-${toYear}`;
  return a === b ? a : `${a}_a_${b}`;
}

export function isValidPeriod(fromMonth: number, fromYear: number, toMonth: number, toYear: number) {
  return fromYear * 12 + fromMonth <= toYear * 12 + toMonth;
}
