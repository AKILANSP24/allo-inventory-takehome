import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const reservation = await prisma.reservation.findUnique({ where: { id } })
    if (!reservation) {
        return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 })
    }
    return NextResponse.json(reservation)
}