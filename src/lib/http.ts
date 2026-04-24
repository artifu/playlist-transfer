export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string
  ) {
    super(`HTTP ${status} for ${url}: ${body}`);
  }
}

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(response.status, input, text);
  }

  return (await response.json()) as T;
}
