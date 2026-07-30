import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

let priceData = [];

function parsePriceTable(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 10);
  const products = [];
  for (const line of lines) {
    if (line.includes('سعر العضو') || line.includes('سعر غير العضو') || line.includes('عدد النقاط')) continue;
    if (line.includes('PERSONAL CARE') || line.includes('FOOD & PEVERAGE') || line.includes('HEALTH FOOD')) continue;
    if (line.trim().length < 20) continue;

    // استخراج جميع الأرقام العشرية من السطر
    const numbers = line.match(/\d+\.\d+/g);
    if (!numbers || numbers.length < 3) continue;

    // نأخذ آخر 3 أرقام (هي الأسعار والنقاط)
    const dp = parseFloat(numbers[numbers.length - 3]);
    const rp = parseFloat(numbers[numbers.length - 2]);
    const pv = parseFloat(numbers[numbers.length - 1]);
    if (isNaN(dp) || isNaN(rp) || isNaN(pv)) continue;

    // استخراج اسم المنتج: النص قبل أول رقم من آخر 3 أرقام
    const lastThreeStart = line.lastIndexOf(numbers[numbers.length - 3]);
    let name = line.substring(0, lastThreeStart).trim();
    // تنظيف الاسم من الأرقام التسلسلية في البداية (مثل "29 ")
    name = name.replace(/^\d+\s*/, '').trim();
    if (name.length > 2) {
      products.push({ name, dp, rp, pv });
    }
  }
  return products;
}

export async function loadPriceList() {
  const txtPath = path.join(KNOWLEDGE_DIR, 'prices.txt');
  if (!await fs.pathExists(txtPath)) {
    console.warn('⚠️ ملف prices.txt غير موجود');
    return [];
  }
  console.log('📄 جاري تحميل قائمة الأسعار من prices.txt...');
  const text = await fs.readFile(txtPath, 'utf-8');
  const products = parsePriceTable(text);
  priceData = products;
  console.log(`✅ تم تحميل ${products.length} منتج من prices.txt.`);
  return products;
}

export function searchPriceList(query) {
  if (!priceData.length) return [];
  const keywords = query.split(/\s+/).filter(w => w.length > 2);
  const results = priceData.filter(p => {
    const lowerName = p.name.toLowerCase();
    return keywords.some(kw => lowerName.includes(kw.toLowerCase()));
  });
  if (results.length === 0) {
    return priceData.slice(0, 5).map(p => ({ ...p, suggestion: true }));
  }
  return results.slice(0, 10);
}

export function formatPriceReply(products, query) {
  if (!products.length) {
    return `🔍 لم أجد منتجات تطابق "${query}". يمكنك الاطلاع على الملف المرفق لترى جميع المنتجات.`;
  }
  let reply = `📊 *نتائج البحث عن: "${query}"*\n\n`;
  const isSuggestion = products[0]?.suggestion;
  if (isSuggestion) {
    reply = `📋 *عرض بعض المنتجات المتاحة (للاستعراض)*\n\n`;
  }
  for (const p of products) {
    reply += `🔹 *${p.name}*\n`;
    reply += `   🟢 سعر العضو: ${p.dp.toFixed(2)} $\n`;
    reply += `   🔴 سعر غير العضو: ${p.rp.toFixed(2)} $\n`;
    reply += `   ⭐ النقاط: ${p.pv.toFixed(2)} P.V\n\n`;
  }
  if (!isSuggestion) {
    reply += `📌 *تم عرض ${products.length} منتج من أصل ${priceData.length} منتج.*\n`;
  }
  reply += `\n📎 *سأرسل لك الملف الآن لتطلع على القائمة الكاملة.*`;
  return reply;
}

export async function sendPriceListPDF(userId, client) {
  const pdfPath = path.join(KNOWLEDGE_DIR, 'pdfs', 'قائمة أسعار المنتجات 2026.pdf');
  if (!await fs.pathExists(pdfPath)) {
    console.warn('⚠️ ملف PDF غير موجود للإرسال');
    return false;
  }
  try {
    await client.sendMessage(userId, {
      document: { file: pdfPath },
      caption: '📄 *قائمة أسعار المنتجات 2026 (كاملة)*\nجميع المنتجات مع الأسعار والنقاط.'
    });
    return true;
  } catch (e) {
    console.error('❌ فشل إرسال ملف PDF:', e.message);
    return false;
  }
}

let KNOWLEDGE_CACHE = null;
export async function loadKnowledge() {
  if (KNOWLEDGE_CACHE) return KNOWLEDGE_CACHE;
  let allText = '';
  const mainFiles = await fs.readdir(KNOWLEDGE_DIR).catch(() => []);
  for (const file of mainFiles) {
    if (file.endsWith('.txt') || file.endsWith('.md')) {
      const content = await fs.readFile(path.join(KNOWLEDGE_DIR, file), 'utf-8').catch(() => '');
      if (content) allText += content + '\n';
    }
  }
  KNOWLEDGE_CACHE = allText;
  return KNOWLEDGE_CACHE;
}
export async function searchInFiles(query) {
  const allText = await loadKnowledge();
  if (!allText || allText.length < 50) return { answer: null, context: null };
  const paragraphs = allText.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  const keywords = query.split(/\s+/).filter(w => w.length > 2);
  const scored = paragraphs.map(p => {
    let score = 0;
    const lower = p.toLowerCase();
    for (const kw of keywords) if (lower.includes(kw.toLowerCase())) score += 5;
    if (lower.includes(query.toLowerCase())) score += 20;
    return { content: p.trim(), score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter(p => p.score > 5);
  if (top.length === 0) return { answer: null, context: null };
  let context = top.slice(0, 6).map(p => p.content).join('\n\n');
  return { answer: context, context };
}

export default { loadKnowledge, searchInFiles, loadPriceList, searchPriceList, formatPriceReply, sendPriceListPDF };
