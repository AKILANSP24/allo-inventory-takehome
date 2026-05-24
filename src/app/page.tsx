'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest } from '@/lib/api'

interface StockEntry {
  warehouseId: string
  warehouseName: string
  location: string
  totalPhysicalUnits: number
  reservedUnits: number
  availableUnits: number
}

interface Product {
  id: string
  name: string
  sku: string
  description: string | null
  stock: StockEntry[]
}

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reserving, setReserving] = useState<string | null>(null)
  const [reserveError, setReserveError] = useState<string | null>(null)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    setLoading(true)
    const { data, error } = await apiRequest<Product[]>('/api/products')
    if (error) setError(error)
    else setProducts(data!)
    setLoading(false)
  }

  async function handleReserve(productId: string, warehouseId: string) {
    const key = `${productId}-${warehouseId}`
    setReserving(key)
    setReserveError(null)
    const { data, error, status } = await apiRequest<{ id: string }>('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
    })
    setReserving(null)
    if (status === 409 || error) { setReserveError(error || 'Not enough stock available.'); return }
    router.push(`/checkout/${data!.id}`)
  }

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 tracking-wide">Loading inventory...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700">{error}</div>
  )

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Products</h1>
          <p className="text-gray-400 mt-1 text-sm">Live inventory across all fulfillment centers</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">Total SKUs</p>
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
        </div>
      </div>

      {/* Error banner */}
      {reserveError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <div className="flex-1">
            <p className="text-red-800 font-semibold text-sm">Out of Stock</p>
            <p className="text-red-600 text-sm mt-0.5">{reserveError}</p>
          </div>
          <button onClick={() => setReserveError(null)} className="text-red-300 hover:text-red-500 text-lg leading-none">×</button>
        </div>
      )}

      {/* Product cards */}
      <div className="space-y-6">
        {products.map((product) => {
          const totalAvailable = product.stock.reduce((s, x) => s + x.availableUnits, 0)
          return (
            <div key={product.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Product header */}
              <div className="px-6 py-5 border-b border-gray-50 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-bold text-gray-900">{product.name}</h2>
                    <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">{product.sku}</span>
                  </div>
                  {product.description && <p className="text-sm text-gray-400">{product.description}</p>}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">Available</p>
                  <p className={`text-2xl font-bold ${totalAvailable === 0 ? 'text-gray-300' : 'text-green-500'}`}>
                    {totalAvailable}
                  </p>
                </div>
              </div>

              {/* Warehouse grid */}
              <div className="grid sm:grid-cols-3 divide-x divide-gray-50">
                {product.stock.map((s) => {
                  const key = `${product.id}-${s.warehouseId}`
                  const isReserving = reserving === key
                  const outOfStock = s.availableUnits === 0
                  const fillPct = s.totalPhysicalUnits > 0
                    ? Math.round((s.availableUnits / s.totalPhysicalUnits) * 100)
                    : 0

                  return (
                    <div key={s.warehouseId} className={`p-5 flex flex-col gap-4 ${outOfStock ? 'bg-gray-50/60' : 'bg-white'}`}>
                      {/* Warehouse info */}
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{s.warehouseName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{s.location}</p>
                      </div>

                      {/* Stock bar */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                          <span>{fillPct}% available</span>
                          <span>{s.totalPhysicalUnits} total</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${fillPct > 50 ? 'bg-green-400' : fillPct > 20 ? 'bg-amber-400' : 'bg-red-400'
                              }`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Available', value: s.availableUnits, color: outOfStock ? 'text-gray-300' : 'text-green-600' },
                          { label: 'Reserved', value: s.reservedUnits, color: 'text-amber-500' },
                          { label: 'Total', value: s.totalPhysicalUnits, color: 'text-gray-600' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="text-center">
                            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                            <p className={`text-lg font-bold ${color}`}>{value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Reserve button */}
                      <button
                        onClick={() => handleReserve(product.id, s.warehouseId)}
                        disabled={outOfStock || isReserving}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${outOfStock
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : isReserving
                            ? 'bg-blue-400 text-white cursor-wait'
                            : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-sm shadow-blue-200'
                          }`}
                      >
                        {isReserving ? 'Reserving...' : outOfStock ? 'Out of Stock' : 'Reserve →'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}