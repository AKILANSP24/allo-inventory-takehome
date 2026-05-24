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

  const [, released] = await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "StockLevel"
      SET "reservedUnits" = GREATEST("reservedUnits" - ${reservation.quantity}, 0)
      WHERE "productId"   = ${reservation.productId}
      AND   "warehouseId" = ${reservation.warehouseId}
    `,
    prisma.reservation.update({
      where: { id },
      data: { status: 'RELEASED' },
    }),
  ])

  return NextResponse.json(released)
}
