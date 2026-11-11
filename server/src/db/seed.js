// Seed: 1 org, 1 owner, 1 location, 10 demo products.
// Run with: npm run db:seed --prefix server
// Safe to re-run: does nothing if the demo owner already exists.
import { pathToFileURL } from 'node:url';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { orgs, users, locations, products } from './schema.js';

export const DEMO_EMAIL = 'owner@demo.local';

const DEMO_PRODUCTS = [
  { sku: 'PARA-500', name: 'Paracetamol 500mg (strip of 10)', category: 'Pain relief', baseUnit: 'strip', costPrice: '0.40', sellPrice: '0.75', reorderLevel: 50, trackBatches: true, barcode: '6001000000011' },
  { sku: 'IBU-400', name: 'Ibuprofen 400mg (strip of 10)', category: 'Pain relief', baseUnit: 'strip', costPrice: '0.55', sellPrice: '1.00', reorderLevel: 40, trackBatches: true, barcode: '6001000000028' },
  { sku: 'AMOX-500', name: 'Amoxicillin 500mg (capsules x20)', category: 'Antibiotics', baseUnit: 'box', costPrice: '2.10', sellPrice: '3.50', reorderLevel: 20, trackBatches: true, barcode: '6001000000035' },
  { sku: 'ORS-SACHET', name: 'Oral rehydration salts (sachet)', category: 'Rehydration', baseUnit: 'sachet', costPrice: '0.15', sellPrice: '0.30', reorderLevel: 100, trackBatches: true, barcode: '6001000000042' },
  { sku: 'VITC-1000', name: 'Vitamin C 1000mg (tube of 20)', category: 'Vitamins', baseUnit: 'tube', costPrice: '1.80', sellPrice: '3.00', reorderLevel: 15, trackBatches: true, barcode: '6001000000059' },
  { sku: 'BAND-ASST', name: 'Adhesive bandages, assorted (box of 40)', category: 'First aid', baseUnit: 'box', costPrice: '0.90', sellPrice: '1.60', reorderLevel: 25, trackBatches: false, barcode: '6001000000066' },
  { sku: 'GAUZE-10', name: 'Sterile gauze pads 10x10cm (pack of 10)', category: 'First aid', baseUnit: 'pack', costPrice: '0.70', sellPrice: '1.30', reorderLevel: 30, trackBatches: false, barcode: '6001000000073' },
  { sku: 'SANI-250', name: 'Hand sanitizer 250ml', category: 'Hygiene', baseUnit: 'bottle', costPrice: '1.20', sellPrice: '2.25', reorderLevel: 20, trackBatches: false, barcode: '6001000000080' },
  { sku: 'THERM-DIG', name: 'Digital thermometer', category: 'Devices', baseUnit: 'pcs', costPrice: '2.50', sellPrice: '4.50', reorderLevel: 10, trackBatches: false, barcode: '6001000000097' },
  { sku: 'MASK-50', name: 'Surgical face masks (box of 50)', category: 'Hygiene', baseUnit: 'box', costPrice: '1.60', sellPrice: '2.80', reorderLevel: 20, trackBatches: false, barcode: '6001000000103' },
];

// Takes a drizzle db so it can be run against any Postgres.
export async function runSeed(db, { password } = {}) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing.length > 0) return { seeded: false };

  const passwordHash = await argon2.hash(password);

  await db.transaction(async (tx) => {
    const [org] = await tx.insert(orgs).values({ name: 'Demo Pharmacy' }).returning();
    await tx.insert(users).values({
      orgId: org.id,
      email: DEMO_EMAIL,
      passwordHash,
      role: 'owner',
    });
    await tx.insert(locations).values({ orgId: org.id, name: 'Main store' });
    await tx.insert(products).values(DEMO_PRODUCTS.map((p) => ({ ...p, orgId: org.id })));
  });

  return { seeded: true };
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db, pool } = await import('./client.js');
  const password = process.env.SEED_OWNER_PASSWORD || 'ChangeMe123!';
  try {
    const { seeded } = await runSeed(db, { password });
    if (seeded) {
      console.log(`Seeded demo org. Login: ${DEMO_EMAIL} / ${process.env.SEED_OWNER_PASSWORD ? '(your SEED_OWNER_PASSWORD)' : password}`);
      if (!process.env.SEED_OWNER_PASSWORD) console.log('Change this password, or set SEED_OWNER_PASSWORD before seeding anything but local data.');
    } else {
      console.log(`Already seeded (${DEMO_EMAIL} exists). Nothing to do.`);
    }
  } finally {
    await pool.end();
  }
}
