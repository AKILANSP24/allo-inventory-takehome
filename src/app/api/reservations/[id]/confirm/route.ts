import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const reservation = await prisma.reservation.findUnique({ where: { id } })

  if (!reservation) {
    return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 })
  }

  if (reservation.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Reservation is already ${reservation.status}.` },
      { status: 409 }
    )
  }

  if (new Date() > reservation.expiresAt) {
    return NextResponse.json(
      { error: 'Reservation has expired. Please start a new checkout.' },
      { status: 410 }
    )
  }

  // Atomically decrement physical stock and reservedUnits together
  const [, confirmed] = await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "StockLevel"
      SET "totalPhysicalUnits" = "totalPhysicalUnits" - ${reservation.quantity},
          "reservedUnits"      = "reservedUnits"      - ${reservation.quantity}
      WHERE "productId"   = ${reservation.productId}
      AND   "warehouseId" = ${reservation.warehouseId}
    `,
    prisma.reservation.update({
      where: { id },
      data: { status: 'CONFIRMED' },
    }),
  ])

  return NextResponse.json(confirmed)
}
