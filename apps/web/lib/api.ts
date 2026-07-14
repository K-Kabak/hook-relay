const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(message ?? `Request failed (${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export type Project = { id: string; name: string; slug: string; createdAt: string; updatedAt: string };
export type DeliveryStatus = 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'RETRYING' | 'FAILED';
export type EventItem = { id: string; type: string; payload: Record<string, unknown>; createdAt: string; _count?: { deliveries: number } };
export type Delivery = {
  id: string;
  status: DeliveryStatus;
  attemptCount: number;
  lastStatusCode?: number;
  lastError?: string;
  lastResponseBody?: string;
  createdAt: string;
  updatedAt: string;
  endpoint: { id: string; name: string; url: string };
};

