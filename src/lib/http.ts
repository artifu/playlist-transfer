export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} for ${input}: ${text}`);
  }

  return (await response.json()) as T;
}
