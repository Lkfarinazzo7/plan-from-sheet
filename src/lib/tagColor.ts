const PALETTE = [
  { bg: 'hsl(210 90% 95%)', fg: 'hsl(210 80% 30%)', border: 'hsl(210 80% 75%)' },
  { bg: 'hsl(150 70% 92%)', fg: 'hsl(150 60% 25%)', border: 'hsl(150 50% 70%)' },
  { bg: 'hsl(30 90% 92%)', fg: 'hsl(30 80% 30%)', border: 'hsl(30 70% 70%)' },
  { bg: 'hsl(280 70% 94%)', fg: 'hsl(280 60% 35%)', border: 'hsl(280 50% 75%)' },
  { bg: 'hsl(340 80% 94%)', fg: 'hsl(340 70% 35%)', border: 'hsl(340 60% 75%)' },
  { bg: 'hsl(190 80% 92%)', fg: 'hsl(190 70% 25%)', border: 'hsl(190 60% 70%)' },
  { bg: 'hsl(60 80% 90%)', fg: 'hsl(45 70% 30%)', border: 'hsl(50 60% 65%)' },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getTagColor(name?: string | null) {
  if (!name) return PALETTE[0];
  return PALETTE[hash(name) % PALETTE.length];
}

export function getTipoColor(tipo: string) {
  if (tipo === 'PJ') return PALETTE[0];
  if (tipo === 'PF') return PALETTE[1];
  return PALETTE[3];
}

export function tagStyle(p: { bg: string; fg: string; border: string }) {
  return { backgroundColor: p.bg, color: p.fg, borderColor: p.border };
}
