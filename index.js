import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import express from 'express';
import mongoose from 'mongoose';
import { logger } from './logger.js';
import { initTelegram, watchKnowledge } from './telegram.js';
import { initCache } from './utils.js';
import { validateEnv } from './config.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

async function initDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('✅ MongoDB connected');
  } catch (error) {
    logger.error(`❌ DB connection failed: ${error.message}`);
    console.log('⚠️ Continuing without database');
  }
}

async function initApp() {
  try {
    console.log('🚀 Starting DXN Assistant...');
    initCache();
    await initDatabase();
    watchKnowledge();
    await initTelegram();

    app.get('/', (req, res) => res.send('DXN Assistant is running!'));
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    });

    process.on('SIGINT', () => { console.log('🛑 Shutting down...'); process.exit(0); });
    process.on('SIGTERM', () => { console.log('🛑 Shutting down...'); process.exit(0); });
  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

initApp();
