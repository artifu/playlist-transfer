export function normalizeText(input) {
  if (!input) return "";

  return String(input)
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

export function namesRoughlyMatch(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return a === b || a.includes(b) || b.includes(a);
}

