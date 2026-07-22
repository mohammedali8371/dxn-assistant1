import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import express from 'express';
import mongoose from 'mongoose';
import { logger } from './logger.js';
import { initTelegram } from './telegram.js';
import { watchKnowledge } from './telegram.js';
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
    logger.error(`❌ DB: ${error.message}`);
    // لا نخرج من العملية، نستمر بدون قاعدة بيانات
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
      logger.info(`🌐 Dashboard: http://localhost:${PORT}`);
    });

    process.on('SIGINT', () => { logger.info('🛑 Shutting down...'); process.exit(0); });
    process.on('SIGTERM', () => { logger.info('🛑 Shutting down...'); process.exit(0); });
  } catch (error) {
    logger.error(`❌ Startup failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// معالجة الاستثناءات غير المعالجة
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

initApp();
