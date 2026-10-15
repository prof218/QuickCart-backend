import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * Connect to MongoDB using Mongoose.
 * Throws if MONGODB_URI is missing so startup fails loudly.
 */
export async function connectDB() {
  if (!config.mongoUri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env and provide a connection string.'
    );
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
}

export function dbState() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
