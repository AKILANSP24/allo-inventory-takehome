'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { apiRequest } from '@/lib/api'

interface Reservation {
    id: string
    productId: string
    warehouseId: string
    quantity: number
    status: 'PENDING' | 'CONFIRMED' | 'RELEASED'
    createdAt: string
    expiresAt: string
}

const C = {
    bg: '#0e0e0e',
    surface: '#131313',
    surfaceLow: '#1c1b1b',
    surfaceContainer: '#20201f',
    surfaceHigh: '#2a2a2a',
    border: '#424936',
    borderMuted: '#2a2a2a',
    text: '#e5e2e1',
    textMuted: '#c2cab0',
    textDim: '#8c947c',
    primary: '#ccff80',
    primaryContainer: '#a3e635',
    onPrimary: '#213600',
    secondary: '#ffc640',
    error: '#ffb4ab',
    errorBg: '#93000a',
}

function useCountdown(expiresAt: string | null) {
    const [secondsLeft, setSecondsLeft] = useState(0)
    useEffect(() => {
        if (!expiresAt) return
        const tick = () => setSecondsLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [expiresAt])
    const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
    const secs = String(secondsLeft % 60).padStart(2, '0')
    return { secondsLeft, display: `${mins}:${secs}` }
}

export default function CheckoutPage() {
    const router = useRouter()
    const { reservationId } = useParams() as { reservationId: string }
    const [reservation, setReservation] = useState<Reservation | null>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<'confirm' | 'cancel' | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [errorCode, setErrorCode] = useState<number | null>(null)
    const [done, setDone] = useState<'confirmed' | 'released' | null>(null)
    const { secondsLeft, display } = useCountdown(reservation?.expiresAt ?? null)

    const fetchReservation = useCallback(async () => {
        const { data, error } = await apiRequest<Reservation>(`/api/reservations/${reservationId}`)
        if (error) setError(error)
        else setReservation(data!)
        setLoading(false)
    }, [reservationId])

    useEffect(() => { fetchReservation() }, [fetchReservation])

    useEffect(() => {
        if (secondsLeft === 0 && reservation?.status === 'PENDING') {
            setError('Your reservation has expired. Units have been released back to stock.')
            setErrorCode(410)
        }
    }, [secondsLeft, reservation?.status])

    async function handleConfirm() {
        setActionLoading('confirm'); setError(null)
        const { data, error, status } = await apiRequest<Reservation>(`/api/reservations/${reservationId}/confirm`, { method: 'POST' })
        setActionLoading(null)
        if (error) { setError(error); setErrorCode(status); return }
        setReservation(data!); setDone('confirmed')
    }

    async function handleCancel() {
        setActionLoading('cancel'); setError(null)
        const { data, error, status } = await apiRequest<Reservation>(`/api/reservations/${reservationId}/release`, { method: 'POST' })
        setActionLoading(null)
        if (error) { setError(error); setErrorCode(status); return }
        setReservation(data!); setDone('released')
    }

    const isExpired = secondsLeft === 0
    const urgency = secondsLeft > 0 && secondsLeft < 120
    const timerColor = isExpired ? C.error : urgency ? C.secondary : C.primary

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div style={{ width: 40, height: 40, border: `2px solid ${C.primaryContainer}`, borderTopColor: 'transparent', borderRadius: '50%' }}
                className="animate-spin" />
        </div>
    )

    if (done === 'confirmed') return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div style={{ textAlign: 'center', maxWidth: 400 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: `${C.primaryContainer}22`, border: `2px solid ${C.primaryContainer}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 40, color: C.primaryContainer }}>check_circle</span>
                </div>
                <h2 style={{ fontFamily: 'Hanken Grotesk', fontSize: 32, fontWeight: 700, color: C.text, marginBottom: 8 }}>Order Confirmed</h2>
                <p style={{ color: C.textMuted, fontSize: 15, marginBottom: 32 }}>Payment successful. Stock has been permanently decremented from the warehouse.</p>
                <button onClick={() => router.push('/')}
                    style={{ backgroundColor: C.primaryContainer, color: C.onPrimary, fontWeight: 700, padding: '12px 32px', borderRadius: 8, fontFamily: 'Inter', fontSize: 15, cursor: 'pointer', border: 'none' }}>
                    Back to Products
                </button>
            </div>
        </div>
    )

    if (done === 'released') return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div style={{ textAlign: 'center', maxWidth: 400 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: `${C.surfaceHigh}`, border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 40, color: C.textMuted }}>close</span>
                </div>
                <h2 style={{ fontFamily: 'Hanken Grotesk', fontSize: 32, fontWeight: 700, color: C.text, marginBottom: 8 }}>Reservation Cancelled</h2>
                <p style={{ color: C.textMuted, fontSize: 15, marginBottom: 32 }}>Your hold has been released. Units are available for other shoppers.</p>
                <button onClick={() => router.push('/')}
                    style={{ backgroundColor: C.primaryContainer, color: C.onPrimary, fontWeight: 700, padding: '12px 32px', borderRadius: 8, fontFamily: 'Inter', fontSize: 15, cursor: 'pointer', border: 'none' }}>
                    Back to Products
                </button>
            </div>
        </div>
    )

    return (
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
            <button onClick={() => router.push('/')}
                style={{ color: C.textMuted, fontSize: 14, fontFamily: 'Inter', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                Back to products
            </button>

            <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>

                {/* Header */}
                <div style={{ borderBottom: `1px solid ${C.border}`, padding: '20px 24px' }} className="text-center">
                    <h1 style={{ fontFamily: 'Hanken Grotesk', fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                        Complete Your Purchase
                    </h1>
                    <div className="flex items-center justify-center gap-2">
                        <span style={{ color: C.textMuted, fontSize: 14, fontFamily: 'Inter' }}>Reservation ID:</span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: C.textMuted, backgroundColor: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px' }}>
                            {reservationId.slice(0, 16)}...
                        </span>
                    </div>
                </div>

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Countdown timer */}
                    {reservation?.status === 'PENDING' && (
                        <div style={{ backgroundColor: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: `${timerColor}08` }} />
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 64, fontWeight: 700, color: timerColor, lineHeight: 1, letterSpacing: '0.05em' }}
                                    className={urgency ? 'animate-pulse' : ''}>
                                    {display}
                                </div>
                                <div className="flex items-center justify-center gap-2 mt-3">
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: timerColor }}>
                                        {isExpired ? 'timer_off' : 'schedule'}
                                    </span>
                                    <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: timerColor, textTransform: 'uppercase', fontFamily: 'Inter' }}>
                                        {isExpired ? 'Reservation Expired' : urgency ? 'Expiring soon — act now' : 'Reservation expires soon'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error banner */}
                    {error && (
                        <div style={{
                            backgroundColor: errorCode === 410 ? `${C.secondary}18` : `${C.errorBg}44`,
                            border: `1px solid ${errorCode === 410 ? C.secondary + '55' : C.error + '55'}`,
                            borderRadius: 8, padding: 16,
                        }} className="flex items-start gap-3">
                            <span className="material-symbols-outlined" style={{ color: errorCode === 410 ? C.secondary : C.error, fontSize: 20 }}>
                                {errorCode === 410 ? 'timer_off' : 'error'}
                            </span>
                            <div>
                                <p style={{ fontWeight: 700, fontSize: 14, color: errorCode === 410 ? C.secondary : C.error }}>
                                    {errorCode === 410 ? 'Reservation Expired (410)' : 'Error'}
                                </p>
                                <p style={{ fontSize: 13, color: errorCode === 410 ? C.secondary : C.error, opacity: 0.8, marginTop: 2 }}>{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Reservation details */}
                    {reservation && (
                        <div style={{ backgroundColor: C.surfaceLow, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}55`, backgroundColor: `${C.surface}88` }}>
                                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: C.textMuted, textTransform: 'uppercase', fontFamily: 'Inter' }}>
                                    Order Details
                                </span>
                            </div>
                            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {[
                                    { label: 'Allocated Quantity', value: `${reservation.quantity} unit(s)`, mono: true },
                                    { label: 'Current Status', value: reservation.status, color: reservation.status === 'PENDING' ? C.secondary : reservation.status === 'CONFIRMED' ? C.primary : C.textMuted, badge: true },
                                    { label: 'Reserved at', value: new Date(reservation.createdAt).toLocaleTimeString(), mono: true },
                                    { label: 'Expires at', value: new Date(reservation.expiresAt).toLocaleTimeString(), mono: true },
                                ].map(({ label, value, mono, color, badge }, i, arr) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}33` : 'none' }}>
                                        <span style={{ fontFamily: 'Inter', fontSize: 14, color: C.textMuted }}>{label}</span>
                                        {badge ? (
                                            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'Inter', backgroundColor: `${color}18`, color, border: `1px solid ${color}44`, borderRadius: 999, padding: '2px 10px' }}>
                                                {value}
                                            </span>
                                        ) : (
                                            <span style={{ fontFamily: mono ? 'JetBrains Mono' : 'Inter', fontSize: 14, fontWeight: 500, color: C.text }}>
                                                {value}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    {reservation?.status === 'PENDING' && !isExpired && (
                        <div className="flex gap-3">
                            <button onClick={handleCancel} disabled={!!actionLoading}
                                style={{ flex: 1, padding: '12px', borderRadius: 8, fontFamily: 'Inter', fontSize: 14, fontWeight: 600, cursor: actionLoading ? 'wait' : 'pointer', backgroundColor: 'transparent', color: C.textMuted, border: `1px solid ${C.border}`, opacity: actionLoading ? 0.5 : 1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Reservation'}
                            </button>
                            <button onClick={handleConfirm} disabled={!!actionLoading}
                                style={{ flex: 1, padding: '12px', borderRadius: 8, fontFamily: 'Inter', fontSize: 14, fontWeight: 700, cursor: actionLoading ? 'wait' : 'pointer', backgroundColor: actionLoading ? `${C.primaryContainer}88` : C.primaryContainer, color: C.onPrimary, border: 'none', opacity: actionLoading ? 0.7 : 1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                                {actionLoading === 'confirm' ? 'Confirming...' : 'Confirm Purchase'}
                            </button>
                        </div>
                    )}

                    {isExpired && !done && (
                        <button onClick={() => router.push('/')}
                            style={{ width: '100%', padding: '12px', borderRadius: 8, backgroundColor: C.primaryContainer, color: C.onPrimary, fontFamily: 'Inter', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: 'none' }}>
                            Find Another Product
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}