import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { releaseExpiredReservations } from '@/lib/cleanup'

export async function GET() {
    // Lazy cleanup — sweep expired reservations on every read
    await releaseExpiredReservations()

    const products = await prisma.product.findMany({
        include: {
            stockLevels: {
                include: { warehouse: true },
            },
        },
        orderBy: { name: 'asc' },
    })

    const response = products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        description: p.description,
        stock: p.stockLevels.map((s) => ({
            warehouseId: s.warehouseId,
            warehouseName: s.warehouse.name,
            location: s.warehouse.location,
            totalPhysicalUnits: s.totalPhysicalUnits,
            reservedUnits: s.reservedUnits,
            availableUnits: s.totalPhysicalUnits - s.reservedUnits,
        })),
    }))

    return NextResponse.json(response)
}