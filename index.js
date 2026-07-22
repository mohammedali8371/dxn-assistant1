import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { config, validateEnv } from './config.js';
import { connectDB, User, Stat, getMemoryStats } from './database.js';
import { initCache, flushCache, getCacheStats } from './utils.js';
import { initTelegram, rebuildKnowledge, watchKnowledge, getKnowledgeStats } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = config.port || 3000;

// ===== لوحة التحكم =====
const auth = (req,res,next) => {
  const pass = req.headers['x-password'] || req.query.password;
  if (pass === config.dashboardPassword) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API
app.get('/api/stats', auth, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [totalUsers, todayStats, memStats, knowStats, cacheStats] = await Promise.all([
      User.countDocuments(),
      Stat.findOne({ date: today }),
      getMemoryStats(),
      getKnowledgeStats(),
      getCacheStats(),
    ]);
    res.json({
      users: { total: totalUsers, active: todayStats?.users?.active||0, new: todayStats?.users?.new||0 },
      messages: { total: todayStats?.messages?.total||0, text: todayStats?.messages?.text||0, image: todayStats?.messages?.image||0, audio: todayStats?.messages?.audio||0, video: todayStats?.messages?.video||0, file: todayStats?.messages?.file||0 },
      ai: { totalRequests: todayStats?.ai?.totalRequests||0, chatCompletions: todayStats?.ai?.chatCompletions||0, totalTokens: todayStats?.ai?.totalTokens||0, estimatedCost: todayStats?.ai?.estimatedCost||0 },
      rag: { totalQueries: todayStats?.rag?.totalQueries||0, totalRetrievals: todayStats?.rag?.totalRetrievals||0 },
      system: { errors: todayStats?.system?.errors||0 },
      memory: memStats,
      knowledge: knowStats,
      cache: cacheStats,
    });
  } catch(e) { logger.errorWithContext('Stats error', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/rebuild-knowledge', auth, async (req, res) => {
  try { const count = await rebuildKnowledge(); res.json({ success:true, chunks:count }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flush-cache', auth, async (req, res) => {
  try { flushCache(); res.json({ success:true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// صفحة الواجهة
app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html dir="rtl">
  <head><meta charset="UTF-8"><title>مساعد DXN</title>
  <style>
    body{font-family:sans-serif;background:#f0f2f5;padding:20px;text-align:center}
    .card{background:white;border-radius:12px;padding:20px;margin:10px;display:inline-block;min-width:150px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
    .val{font-size:28px;font-weight:bold;color:#2d4059}
    .lbl{color:#6c757d;font-size:14px}
    button{padding:10px 20px;margin:5px;border:none;border-radius:8px;background:#4e6bff;color:white;font-weight:bold;cursor:pointer}
    .grid{display:flex;flex-wrap:wrap;justify-content:center;max-width:1200px;margin:auto}
  </style>
  </head>
  <body>
    <h1>📊 لوحة تحكم مساعد DXN</h1>
    <div class="grid" id="stats"></div>
    <div style="margin-top:20px">
      <button onclick="rebuild()">🔄 إعادة بناء المعرفة</button>
      <button onclick="flush()">🗑️ تفريغ الكاش</button>
    </div>
    <script>
      async function loadStats() {
        const pass = prompt('كلمة المرور:')||'';
        const r = await fetch('/api/stats?password='+encodeURIComponent(pass));
        const d = await r.json();
        const grid = document.getElementById('stats');
        grid.innerHTML = '';
        const items = [
          ['👥 المستخدمين', d.users.total, 'نشط: '+d.users.active],
          ['💬 الرسائل', d.messages.total, 'نص: '+d.messages.text],
          ['🤖 طلبات AI', d.ai.totalRequests, 'توكنات: '+d.ai.totalTokens],
          ['📚 المعرفة', d.knowledge.totalChunks, 'ملفات: '+d.knowledge.totalFiles],
          ['🧠 المحادثات', d.memory.totalConversations, 'رسائل: '+d.memory.totalMessages],
          ['🗄️ الكاش', d.cache.size, 'نسبة نجاح: '+(d.cache.hitRatio*100).toFixed(1)+'%']
        ];
        for(const [lbl,val,sub] of items) {
          const c = document.createElement('div'); c.className='card';
          c.innerHTML = '<div class="lbl">'+lbl+'</div><div class="val">'+val+'</div><div style="font-size:12px;color:#6c757d">'+sub+'</div>';
          grid.appendChild(c);
        }
      }
      async function rebuild() {
        if(!confirm('إعادة بناء المعرفة؟')) return;
        const pass = prompt('كلمة المرور:');
        const r = await fetch('/api/rebuild-knowledge?password='+encodeURIComponent(pass), {method:'POST'});
        const d = await r.json();
        alert(d.success ? '✅ تم إعادة البناء ('+d.chunks+' جزء)' : '❌ فشل');
        loadStats();
      }
      async function flush() {
        if(!confirm('تفريغ الكاش؟')) return;
        const pass = prompt('كلمة المرور:');
        await fetch('/api/flush-cache?password='+encodeURIComponent(pass), {method:'POST'});
        alert('✅ تم التفريغ');
        loadStats();
      }
      loadStats();
      setInterval(loadStats, 30000);
    </script>
  </body>
  </html>
  `);
});

// ===== التشغيل الرئيسي =====
async function main() {
  try {
    // validateEnv();
    logger.info('🚀 Starting DXN Assistant...');
    initCache();
    await connectDB();
    watchKnowledge();
    await initTelegram();
    app.listen(PORT, () => logger.info(`🌐 Dashboard: http://localhost:${PORT}`));
  } catch(e) { logger.errorWithContext('Startup failed', e); process.exit(1); }
}

process.on('SIGINT', () => { logger.info('🛑 Shutting down...'); process.exit(0); });
main();
