export const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function apiRequest<T>(
    path: string,
    options?: RequestInit
): Promise<{ data: T | null; error: string | null; status: number }> {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        })

        const json = await res.json() as T | { error?: string }

        if (!res.ok) {
            const errBody = json as { error?: string }
            return {
                data: null,
                error: errBody.error ?? 'Something went wrong',
                status: res.status,
            }
        }

        return { data: json as T, error: null, status: res.status }
    } catch {
        return { data: null, error: 'Network error', status: 500 }
    }
}