export function normalizeText(input: string | null | undefined): string {
  if (!input) {
    return "";
  }

  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((feat|ft|with)[^)]+\)/g, "")
    .replace(/\[(feat|ft|with)[^\]]+\]/g, "")
    .replace(/\((remaster|remastered|live|mono|stereo)[^)]+\)/g, "")
    .replace(/\[(remaster|remastered|live|mono|stereo)[^\]]+\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesRoughlyMatch(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);

  return a === b || a.includes(b) || b.includes(a);
}
