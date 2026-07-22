import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { logger } from './logger.js';
import { initTelegram } from './telegram.js';
import { initCache } from './utils.js';

const app = express();
const PORT = process.env.PORT || 3000;

async function initApp() {
  try {
    console.log('🚀 Starting DXN Assistant on Render...');
    initCache();
    await initTelegram();

    app.get('/', (req, res) => res.send('DXN Assistant is running! ✅'));
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => console.error('Uncaught:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));

initApp();
