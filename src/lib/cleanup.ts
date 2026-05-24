import { prisma } from './prisma'

export async function releaseExpiredReservations(): Promise<number> {
    const now = new Date()

    // Find all expired PENDING reservations
    const expired = await prisma.reservation.findMany({
        where: { status: 'PENDING', expiresAt: { lt: now } },
        select: { id: true, productId: true, warehouseId: true, quantity: true },
    })

    if (expired.length === 0) return 0

    // Release each one atomically
    await Promise.all(
        expired.map((r) =>
            prisma.$transaction([
                // Decrement reservedUnits back
                prisma.$executeRaw`
          UPDATE "StockLevel"
          SET "reservedUnits" = GREATEST("reservedUnits" - ${r.quantity}, 0)
          WHERE "productId" = ${r.productId}
          AND "warehouseId" = ${r.warehouseId}
        `,
                // Mark reservation as RELEASED
                prisma.reservation.update({
                    where: { id: r.id },
                    data: { status: 'RELEASED' },
                }),
            ])
        )
    )

    return expired.length
}