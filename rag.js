import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

// ===== قائمة المنتجات الثابتة (مضمنة في الكود) =====
const PRICE_LIST = [
  { name: "GANOZHI TOOTHPASTE PLUS 150G", dp: 7.60, rp: 9.75, pv: 2.75 },
  { name: "GANOZHI TOOTHPASTE PLUS 40g (4 PCS)", dp: 12.60, rp: 16.15, pv: 3.95 },
  { name: "GANOZHI SOAP (1'PCS)", dp: 4.10, rp: 5.25, pv: 1.25 },
  { name: "GANOZHI SHAMPOO 250ML", dp: 10.65, rp: 13.65, pv: 4.35 },
  { name: "GANOZHI SHAMPOO PLUS 250ML", dp: 12.55, rp: 16.05, pv: 4.76 },
  { name: "GANOZHI BODY FOAM 250ML", dp: 10.65, rp: 13.65, pv: 4.35 },
  { name: "TALCUM POWDER 250G", dp: 9.25, rp: 11.85, pv: 3.75 },
  { name: "TEA TREE CREAM 30G", dp: 7.60, rp: 9.75, pv: 3.20 },
  { name: "GANO MASSAGE OIL 75ML", dp: 10.70, rp: 13.70, pv: 4.35 },
  { name: "CHUBBY BABY OIL 200ML", dp: 7.95, rp: 10.20, pv: 2.65 },
  { name: "DXN TOOTHBRUSH ADULT", dp: 3.75, rp: 4.80, pv: 1.15 },
  { name: "DXN TOOTHBRUSH CHILD", dp: 3.75, rp: 4.80, pv: 1.15 },
  { name: "GANOZHI LIQUID CLEANSER 150ML", dp: 36.25, rp: 46.40, pv: 13.75 },
  { name: "GANOZHI TONER 150ML", dp: 36.25, rp: 46.40, pv: 13.75 },
  { name: "GANOZHI MOISTURIZING MICRO EMULSION", dp: 40.65, rp: 52.05, pv: 15.15 },
  { name: "GANOZHI LIPSTICK - COCO RED", dp: 16.45, rp: 21.05, pv: 6.45 },
  { name: "GANOZHI LIPSTICK - PEARLY RED", dp: 16.45, rp: 21.05, pv: 6.45 },
  { name: "GANOZHI LIPSTICK - PEARLY PINK", dp: 16.45, rp: 21.05, pv: 6.45 },
  { name: "GANOZHI LIPSTICK - PEARLY GRAPE", dp: 16.45, rp: 21.05, pv: 6.45 },
  { name: "DXN ALOE.V F CLEANSING GEL 100ML", dp: 8.45, rp: 10.80, pv: 2.82 },
  { name: "DXN ALOE V. HYDRATING TONER 100ML", dp: 8.45, rp: 10.80, pv: 2.82 },
  { name: "DXN ALOE V AQUA GEL 50ML", dp: 15.70, rp: 20.10, pv: 5.42 },
  { name: "DXN ALOE V. NUTRICARE CREAM 30ML", dp: 11.10, rp: 14.20, pv: 3.85 },
  { name: "ALOE.V HAND & BODY LOTION 250ML", dp: 8.45, rp: 10.80, pv: 2.82 },
  { name: "DXN PAPAYA FACIAL SCRUB 120ML", dp: 11.60, rp: 14.85, pv: 3.82 },
  { name: "FIZA PERFUME 50ML", dp: 35.60, rp: 45.55, pv: 11.25 },
  { name: "FAYHA PERFUME 50ML", dp: 35.60, rp: 45.55, pv: 11.25 },
  { name: "LINGZHI COFFEE 3 IN 1 20'S X 21G", dp: 13.65, rp: 17.45, pv: 5.23 },
  { name: "DXN CREAM COFFEE 20'S X 14G", dp: 16.00, rp: 20.50, pv: 5.53 },
  { name: "LINGZHI COFFEE 3 IN 1 LITE 20'S X 21G", dp: 13.65, rp: 17.45, pv: 5.43 },
  { name: "CORDYCEPS COFFEE 3 IN 1 20'S X 21G", dp: 17.05, rp: 21.80, pv: 6.55 },
  { name: "LINGZHI BLACK COFFEE 2 IN 1 20'S X 4.5G", dp: 13.65, rp: 17.45, pv: 5.23 },
  { name: "LINGZHI TEA 75'SACHET", dp: 13.50, rp: 17.30, pv: 5.33 },
  { name: "LEMONZHI 20'S X 22G", dp: 13.25, rp: 16.95, pv: 4.35 },
  { name: "COCOZHI 20'S X 32G", dp: 17.80, rp: 22.80, pv: 6.55 },
  { name: "MORINZHI JUICE 285ML", dp: 18.90, rp: 24.20, pv: 7.23 },
  { name: "MORINZHI JUICE 700ML", dp: 39.90, rp: 51.05, pv: 15.45 },
  { name: "MORINZYME JUICE 285ML", dp: 18.90, rp: 24.20, pv: 7.24 },
  { name: "DXN VINAIGRETTE 700ML", dp: 33.50, rp: 42.90, pv: 12.14 },
  { name: "ZHI MINT PLUS 12'S X 25TAB", dp: 28.25, rp: 36.15, pv: 11.45 },
  { name: "PINEAPPLE JAM 440G", dp: 7.40, rp: 9.45, pv: 2.54 },
  { name: "COCONUT OIL 500G", dp: 24.45, rp: 31.30, pv: 8.05 },
  { name: "DXN NATURAL SIDR HONY 450G", dp: 45.15, rp: 57.80, pv: 13.84 },
  { name: "DXN HIMALAYAN SALT 650G", dp: 8.55, rp: 10.95, pv: 2.60 },
  { name: "MUSHROOM POWDER 70G", dp: 72.40, rp: 92.65, pv: 31.00 },
  { name: "SPIRULINA CANDY 500'PCS", dp: 74.20, rp: 95.00, pv: 31.45 },
  { name: "SPIRULINA CANDY 120'PCS", dp: 22.25, rp: 28.50, pv: 8.85 },
  { name: "SPIRULINA CEREAL30'S*30G", dp: 36.90, rp: 47.25, pv: 12.95 },
  { name: "LIONS MANE CANDY 120'PCS", dp: 31.65, rp: 40.50, pv: 11.75 },
  { name: "CORDYCEPS CANDY 120'PCS", dp: 71.65, rp: 91.70, pv: 28.15 },
  { name: "MYCOVEGGIE 400G", dp: 69.30, rp: 88.70, pv: 28.95 },
  { name: "MYCOVITA POWDER 30'S X 12G", dp: 325.40, rp: 416.50, pv: 123.25 }
];

let priceData = [];

export async function loadPriceList() {
  // استخدام القائمة الثابتة مباشرة
  priceData = PRICE_LIST;
  console.log(`✅ تم تحميل ${priceData.length} منتج من القائمة الثابتة.`);
  return priceData;
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
