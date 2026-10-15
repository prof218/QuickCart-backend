/**
 * Seed script — inserts 8 sample products.
 * Usage: npm run seed
 *
 * Prices are INTEGER PAISE (1 INR = 100 paise). rupeesToPaise keeps the
 * source data readable while storing exact integers.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Product } from '../src/models/Product.js';
import { rupeesToPaise } from '../src/utils/money.js';

const products = [
  {
    name: 'Aura Wireless Noise-Cancelling Headphones',
    description:
      'Over-ear Bluetooth headphones with active noise cancellation, 40-hour battery life, and plush memory-foam ear cushions.',
    price: rupeesToPaise(12999),
    image: 'https://picsum.photos/seed/quickcart-headphones/600/600',
    category: 'Audio',
    stock: 25,
  },
  {
    name: 'Pulse Smart Fitness Watch',
    description:
      'AMOLED smartwatch with heart-rate, SpO2, GPS and 14-day battery. Tracks 100+ workout modes and sleep.',
    price: rupeesToPaise(8999),
    image: 'https://picsum.photos/seed/quickcart-watch/600/600',
    category: 'Wearables',
    stock: 40,
  },
  {
    name: 'Clack Mechanical Keyboard (Hot-Swap)',
    description:
      '75% hot-swappable mechanical keyboard with gasket mount, PBT keycaps and per-key RGB. USB-C detachable cable.',
    price: rupeesToPaise(6499),
    image: 'https://picsum.photos/seed/quickcart-keyboard/600/600',
    category: 'Accessories',
    stock: 30,
  },
  {
    name: 'Vortex 4K Action Camera',
    description:
      'Waterproof 4K60 action camera with electronic image stabilization, 170° wide lens and dual displays.',
    price: rupeesToPaise(17999),
    image: 'https://picsum.photos/seed/quickcart-camera/600/600',
    category: 'Electronics',
    stock: 15,
  },
  {
    name: 'Boom Portable Bluetooth Speaker',
    description:
      'Rugged IPX7 waterproof speaker with 360° sound, deep bass radiator and 24-hour playtime. Pairs in stereo.',
    price: rupeesToPaise(3499),
    image: 'https://picsum.photos/seed/quickcart-speaker/600/600',
    category: 'Audio',
    stock: 50,
  },
  {
    name: 'Volt 65W USB-C GaN Charger',
    description:
      'Compact 65W GaN charger with two USB-C and one USB-A port. Fast-charges laptops, tablets and phones.',
    price: rupeesToPaise(1999),
    image: 'https://picsum.photos/seed/quickcart-charger/600/600',
    category: 'Accessories',
    stock: 80,
  },
  {
    name: 'Glide Ergonomic Wireless Mouse',
    description:
      'Silent-click ergonomic mouse with 4000 DPI sensor, 2.4GHz + Bluetooth, and a rechargeable battery.',
    price: rupeesToPaise(2499),
    image: 'https://picsum.photos/seed/quickcart-mouse/600/600',
    category: 'Accessories',
    stock: 60,
  },
  {
    name: 'Clarity 1080p Streaming Webcam',
    description:
      'Full-HD 1080p/60 webcam with autofocus, dual noise-reducing mics and a privacy shutter. Plug-and-play USB.',
    price: rupeesToPaise(3999),
    image: 'https://picsum.photos/seed/quickcart-webcam/600/600',
    category: 'Electronics',
    stock: 35,
  },
];

async function seed() {
  try {
    await connectDB();
    console.log('[seed] connected to MongoDB');

    const deleted = await Product.deleteMany({});
    console.log(`[seed] removed ${deleted.deletedCount} existing product(s)`);

    const inserted = await Product.insertMany(products);
    console.log(`[seed] inserted ${inserted.length} product(s):`);
    for (const p of inserted) {
      console.log(`  - ${p.name}  (${(p.price / 100).toFixed(2)} INR, stock ${p.stock})`);
    }

    console.log('[seed] done ✅');
    process.exitCode = 0;
  } catch (err) {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB().catch(() => {});
    await mongoose.connection.close().catch(() => {});
  }
}

seed();
