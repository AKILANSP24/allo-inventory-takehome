import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { idempotencyGuard } from '@/lib/idempotency'
import { z } from 'zod'

const ReserveSchema = z.object({
    productId: z.string().min(1),
    warehouseId: z.string().min(1),
    quantity: z.number().int().positive(),
})

export async function POST(req: Request) {
    const idempotencyKey = req.headers.get('Idempotency-Key')

    const rawBody = await req.json()
    const parsed = ReserveSchema.safeParse(rawBody)

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request body', details: parsed.error.flatten() },
            { status: 400 }
        )
    }

    const { productId, warehouseId, quantity } = parsed.data

    const execute = async (): Promise<NextResponse> => {
        const RESERVATION_TTL_MINUTES = 10

        // Atomic UPDATE — single SQL, no SELECT needed
        // If available units (total - reserved) < quantity → 0 rows affected → 409
        const result = await prisma.$executeRaw`
      UPDATE "StockLevel"
      SET "reservedUnits" = "reservedUnits" + ${quantity}
      WHERE "productId"   = ${productId}
      AND   "warehouseId" = ${warehouseId}
      AND   ("totalPhysicalUnits" - "reservedUnits") >= ${quantity}
    `

        if (result === 0) {
            return NextResponse.json(
                { error: 'Insufficient stock available.' },
                { status: 409 }
            )
        }

        const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000)

        const reservation = await prisma.reservation.create({
            data: { productId, warehouseId, quantity, status: 'PENDING', expiresAt },
        })

        return NextResponse.json(reservation, { status: 201 })
    }

    // Wrap in idempotency guard if key provided
    if (idempotencyKey) {
        return idempotencyGuard(
            `reservation:${idempotencyKey}`,
            execute
        )
    }

    return execute()
}