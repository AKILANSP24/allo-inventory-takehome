import { NextResponse } from 'next/server'
import { releaseExpiredReservations } from '@/lib/cleanup'

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const released = await releaseExpiredReservations()

  return NextResponse.json({
    success: true,
    releasedCount: released,
    timestamp: new Date().toISOString(),
  })
}
