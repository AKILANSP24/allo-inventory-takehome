import { redis } from './redis'
import { NextResponse } from 'next/server'

const PENDING_TTL = 60        // 60s lock while request is in-flight
const COMPLETED_TTL = 86400   // 24h cache for completed responses

export interface CachedResponse {
    status: number
    body: unknown
}

export async function idempotencyGuard(
    key: string,
    handler: () => Promise<NextResponse>
): Promise<NextResponse> {
    const redisKey = `idempotency:${key}`

    // Atomic: get existing value or set PENDING
    const existing = await redis.get<string>(redisKey)

    // CASE 1 — in-flight request
    if (existing === 'PENDING') {
        return NextResponse.json(
            { error: 'Request in progress. Retry in a moment.' },
            { status: 409, headers: { 'Retry-After': '2' } }
        )
    }

    // CASE 2 — already completed, replay cached response
    if (existing !== null) {
        const cached = existing as unknown as CachedResponse
        return NextResponse.json(cached.body, {
            status: cached.status,
            headers: { 'Idempotent-Replayed': 'true' },
        })
    }

    // CASE 3 — new request, acquire lock
    await redis.set(redisKey, 'PENDING', { ex: PENDING_TTL })

    try {
        const response = await handler()
        const body = await response.json()

        // Cache the completed response
        const toCache: CachedResponse = { status: response.status, body }
        await redis.set(redisKey, toCache, { ex: COMPLETED_TTL })

        return NextResponse.json(body, { status: response.status })
    } catch (err) {
        // Release lock on failure so client can retry
        await redis.del(redisKey)
        throw err
    }
}