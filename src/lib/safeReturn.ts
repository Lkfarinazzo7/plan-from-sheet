/**
 * Sanitiza um caminho de retorno pós-login para evitar open redirect.
 * Aceita apenas caminhos internos absolutos ("/algo"), nunca URLs externas.
 */
export function safeReturnPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  let raw = value;
  try {
    raw = decodeURIComponent(value);
  } catch {
    // mantém o valor original se não for decodificável
  }
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (raw.includes('\n') || raw.includes('\r')) return fallback;
  return raw;
}
