import { PrismaClient, ReservationStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Seeding Allo inventory platform...')

    // Clean slate — order matters due to foreign keys
    await prisma.reservation.deleteMany()
    await prisma.stockLevel.deleteMany()
    await prisma.product.deleteMany()
    await prisma.warehouse.deleteMany()

    // ── Warehouses ──────────────────────────────────────────────
    const chennai = await prisma.warehouse.create({
        data: { name: 'Chennai South FC', location: 'Sholinganallur, Chennai' },
    })
    const mumbai = await prisma.warehouse.create({
        data: { name: 'Mumbai Central FC', location: 'Bhiwandi, Mumbai' },
    })
    const delhi = await prisma.warehouse.create({
        data: { name: 'Delhi North FC', location: 'Naraina, New Delhi' },
    })

    console.log(`✅ Warehouses: ${chennai.name}, ${mumbai.name}, ${delhi.name}`)

    // ── Products ─────────────────────────────────────────────────
    const sneaker = await prisma.product.create({
        data: { name: 'Allo AirRunner X1 (UK 9)', sku: 'ALLO-SNK-001', description: 'Lightweight carbon-fibre midsole runner.' },
    })
    const backpack = await prisma.product.create({
        data: { name: 'Allo UrbanPack 30L', sku: 'ALLO-BAG-002', description: 'Water-resistant 30L daypack with TSA lock.' },
    })
    const watch = await prisma.product.create({
        data: { name: 'Allo SmartWatch Series 3', sku: 'ALLO-WCH-003', description: 'AMOLED, 7-day battery, SpO2 & ECG.' },
    })
    const earbuds = await prisma.product.create({
        data: { name: 'Allo BudsPro ANC', sku: 'ALLO-EAR-004', description: 'Hybrid ANC, 36hr total playback.' },
    })

    console.log(`✅ Products: ${[sneaker, backpack, watch, earbuds].map(p => p.sku).join(', ')}`)

    // ── Stock Levels ─────────────────────────────────────────────
    // Sneakers are deliberately scarce in Chennai to test 409 quickly
    // Watch has zero stock in Delhi to test empty-warehouse display
    const stockData = [
        // Sneaker
        { productId: sneaker.id, warehouseId: chennai.id, totalPhysicalUnits: 3, reservedUnits: 2 },
        { productId: sneaker.id, warehouseId: mumbai.id, totalPhysicalUnits: 25, reservedUnits: 4 },
        { productId: sneaker.id, warehouseId: delhi.id, totalPhysicalUnits: 18, reservedUnits: 1 },
        // Backpack
        { productId: backpack.id, warehouseId: chennai.id, totalPhysicalUnits: 40, reservedUnits: 3 },
        { productId: backpack.id, warehouseId: mumbai.id, totalPhysicalUnits: 55, reservedUnits: 7 },
        { productId: backpack.id, warehouseId: delhi.id, totalPhysicalUnits: 30, reservedUnits: 0 },
        // Watch
        { productId: watch.id, warehouseId: chennai.id, totalPhysicalUnits: 12, reservedUnits: 1 },
        { productId: watch.id, warehouseId: mumbai.id, totalPhysicalUnits: 20, reservedUnits: 5 },
        { productId: watch.id, warehouseId: delhi.id, totalPhysicalUnits: 0, reservedUnits: 0 },
        // Earbuds
        { productId: earbuds.id, warehouseId: chennai.id, totalPhysicalUnits: 60, reservedUnits: 8 },
        { productId: earbuds.id, warehouseId: mumbai.id, totalPhysicalUnits: 45, reservedUnits: 2 },
        { productId: earbuds.id, warehouseId: delhi.id, totalPhysicalUnits: 50, reservedUnits: 6 },
    ]

    await prisma.stockLevel.createMany({ data: stockData })
    console.log('✅ Stock levels seeded across all warehouses.')

    // ── Sample Reservations ──────────────────────────────────────
    const now = new Date()

    await prisma.reservation.createMany({
        data: [
            {
                // Healthy PENDING — still has 8 min left
                productId: sneaker.id,
                warehouseId: mumbai.id,
                quantity: 1,
                status: ReservationStatus.PENDING,
                createdAt: new Date(now.getTime() - 2 * 60 * 1000),
                expiresAt: new Date(now.getTime() + 8 * 60 * 1000),
            },
            {
                // EXPIRED PENDING — cleanup engine should sweep this on first GET /api/products
                productId: watch.id,
                warehouseId: chennai.id,
                quantity: 1,
                status: ReservationStatus.PENDING,
                createdAt: new Date(now.getTime() - 15 * 60 * 1000),
                expiresAt: new Date(now.getTime() - 5 * 60 * 1000),
            },
            {
                // CONFIRMED — completed purchase, should never be touched by cleanup
                productId: backpack.id,
                warehouseId: delhi.id,
                quantity: 2,
                status: ReservationStatus.CONFIRMED,
                createdAt: new Date(now.getTime() - 30 * 60 * 1000),
                expiresAt: new Date(now.getTime() - 20 * 60 * 1000),
            },
            {
                // RELEASED — user cancelled early
                productId: earbuds.id,
                warehouseId: chennai.id,
                quantity: 3,
                status: ReservationStatus.RELEASED,
                createdAt: new Date(now.getTime() - 60 * 60 * 1000),
                expiresAt: new Date(now.getTime() - 50 * 60 * 1000),
            },
        ],
    })

    console.log('✅ Sample reservations seeded (pending, expired-pending, confirmed, released).')
    console.log('\n🎉 Seed complete. Ready for Phase 2.')
}

main()
    .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
    .finally(async () => { await prisma.$disconnect() })