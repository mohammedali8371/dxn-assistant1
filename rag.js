import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

const PRICE_LIST = [
  { en: "GANOZHI TOOTHPASTE PLUS 150G", ar: "معجون جانورهاي بلس 150 جرام", dp: 7.60, rp: 9.75, pv: 2.75 },
  { en: "GANOZHI TOOTHPASTE PLUS 40g (4 PCS)", ar: "معجون جانورهاي بلس صغير 4×40 مل", dp: 12.60, rp: 16.15, pv: 3.95 },
  { en: "GANOZHI SOAP (1'PCS)", ar: "صابون جانورهاي (قطعة)", dp: 4.10, rp: 5.25, pv: 1.25 },
  { en: "GANOZHI SHAMPOO 250ML", ar: "شامبو جانورهاي 250 مل", dp: 10.65, rp: 13.65, pv: 4.35 },
  { en: "GANOZHI SHAMPOO PLUS 250ML", ar: "شامبو جانورهاي بلس 250 مل", dp: 12.55, rp: 16.05, pv: 4.76 },
  { en: "GANOZHI BODY FOAM 250ML", ar: "رغوة جسم جانورهاي 250 مل", dp: 10.65, rp: 13.65, pv: 4.35 },
  { en: "TALCUM POWDER 250G", ar: "بودرة التالك 250 جرام", dp: 9.25, rp: 11.85, pv: 3.75 },
  { en: "TEA TREE CREAM 30G", ar: "كريم شجرة الشاي 30 جرام", dp: 7.60, rp: 9.75, pv: 3.20 },
  { en: "GANO MASSAGE OIL 75ML", ar: "زيت تدليك جانو 75 مل", dp: 10.70, rp: 13.70, pv: 4.35 },
  { en: "CHUBBY BABY OIL 200ML", ar: "زيت الأطفال تشوبي 200 مل", dp: 7.95, rp: 10.20, pv: 2.65 },
  { en: "DXN TOOTHBRUSH ADULT", ar: "فرشاة أسنان للكبار", dp: 3.75, rp: 4.80, pv: 1.15 },
  { en: "DXN TOOTHBRUSH CHILD", ar: "فرشاة أسنان للأطفال", dp: 3.75, rp: 4.80, pv: 1.15 },
  { en: "GANOZHI LIQUID CLEANSER 150ML", ar: "منظف بشرة جانورهاي 150 مل", dp: 36.25, rp: 46.40, pv: 13.75 },
  { en: "GANOZHI TONER 150ML", ar: "تونر جانورهاي 150 مل", dp: 36.25, rp: 46.40, pv: 13.75 },
  { en: "GANOZHI MOISTURIZING MICRO EMULSION", ar: "مرطب مايكرو جانورهاي 50 مل", dp: 40.65, rp: 52.05, pv: 15.15 },
  { en: "GANOZHI LIPSTICK - COCO RED", ar: "أحمر شفاه جانورهاي أحمر", dp: 16.45, rp: 21.05, pv: 6.45 },
  { en: "GANOZHI LIPSTICK - PEARLY RED", ar: "أحمر شفاه جانورهاي أحمر لؤلؤي", dp: 16.45, rp: 21.05, pv: 6.45 },
  { en: "GANOZHI LIPSTICK - PEARLY PINK", ar: "أحمر شفاه جانورهاي وردي لؤلؤي", dp: 16.45, rp: 21.05, pv: 6.45 },
  { en: "GANOZHI LIPSTICK - PEARLY GRAPE", ar: "أحمر شفاه جانورهاي عنابي", dp: 16.45, rp: 21.05, pv: 6.45 },
  { en: "DXN ALOE.V F CLEANSING GEL 100ML", ar: "منظف وجه الوفيرا 100 مل", dp: 8.45, rp: 10.80, pv: 2.82 },
  { en: "DXN ALOE V. HYDRATING TONER 100ML", ar: "تونر مرطب الوفيرا 100 مل", dp: 8.45, rp: 10.80, pv: 2.82 },
  { en: "DXN ALOE V AQUA GEL 50ML", ar: "جل الوفيرا 50 مل", dp: 15.70, rp: 20.10, pv: 5.42 },
  { en: "DXN ALOE V. NUTRICARE CREAM 30ML", ar: "كريم تغذية الوفيرا 30 مل", dp: 11.10, rp: 14.20, pv: 3.85 },
  { en: "ALOE.V HAND & BODY LOTION 250ML", ar: "لوشن الوفيرا 250 مل", dp: 8.45, rp: 10.80, pv: 2.82 },
  { en: "DXN PAPAYA FACIAL SCRUB 120ML", ar: "مقشر البابايا 120 مل", dp: 11.60, rp: 14.85, pv: 3.82 },
  { en: "FIZA PERFUME 50ML", ar: "عطر فيزا رجالي 50 مل", dp: 35.60, rp: 45.55, pv: 11.25 },
  { en: "FAYHA PERFUME 50ML", ar: "عطر فيحاء نسائي 50 مل", dp: 35.60, rp: 45.55, pv: 11.25 },
  { en: "LINGZHI COFFEE 3 IN 1 20'S X 21G", ar: "قهوة لينجزي 3×1 20 كيس", dp: 13.65, rp: 17.45, pv: 5.23 },
  { en: "DXN CREAM COFFEE 20'S X 14G", ar: "قهوة كريمة DXN 20 كيس", dp: 16.00, rp: 20.50, pv: 5.53 },
  { en: "LINGZHI COFFEE 3 IN 1 LITE 20'S X 21G", ar: "قهوة لينجزي لايت 20 كيس", dp: 13.65, rp: 17.45, pv: 5.43 },
  { en: "CORDYCEPS COFFEE 3 IN 1 20'S X 21G", ar: "قهوة كورديسيبس 20 كيس", dp: 17.05, rp: 21.80, pv: 6.55 },
  { en: "LINGZHI BLACK COFFEE 2 IN 1 20'S X 4.5G", ar: "قهوة لينجزي سوداء 20 كيس", dp: 13.65, rp: 17.45, pv: 5.23 },
  { en: "LINGZHI TEA 75'SACHET", ar: "شاي لينجزي 75 كيس", dp: 13.50, rp: 17.30, pv: 5.33 },
  { en: "LEMONZHI 20'S X 22G", ar: "شاي ليمونزي 20 كيس", dp: 13.25, rp: 16.95, pv: 4.35 },
  { en: "COCOZHI 20'S X 32G", ar: "كوكوزي 20 كيس", dp: 17.80, rp: 22.80, pv: 6.55 },
  { en: "MORINZHI JUICE 285ML", ar: "عصير مورينزي 285 مل", dp: 18.90, rp: 24.20, pv: 7.23 },
  { en: "MORINZHI JUICE 700ML", ar: "عصير مورينزي 700 مل", dp: 39.90, rp: 51.05, pv: 15.45 },
  { en: "MORINZYME JUICE 285ML", ar: "عصير مورينزاي 285 مل", dp: 18.90, rp: 24.20, pv: 7.24 },
  { en: "DXN VINAIGRETTE 700ML", ar: "خل فيناقريتي 700 مل", dp: 33.50, rp: 42.90, pv: 12.14 },
  { en: "ZHI MINT PLUS 12'S X 25TAB", ar: "زي مينت بلاس 12 كيس", dp: 28.25, rp: 36.15, pv: 11.45 },
  { en: "PINEAPPLE JAM 440G", ar: "مربى أناناس 440 جرام", dp: 7.40, rp: 9.45, pv: 2.54 },
  { en: "COCONUT OIL 500G", ar: "زيت جوز الهند 500 مل", dp: 24.45, rp: 31.30, pv: 8.05 },
  { en: "DXN NATURAL SIDR HONY 450G", ar: "عسل سدر طبيعي 450 جرام", dp: 45.15, rp: 57.80, pv: 13.84 },
  { en: "DXN HIMALAYAN SALT 650G", ar: "ملح الهيمالايا 650 جرام", dp: 8.55, rp: 10.95, pv: 2.60 },
  { en: "MUSHROOM POWDER 70G", ar: "مسحوق فطر الريشي 70 جرام", dp: 72.40, rp: 92.65, pv: 31.00 },
  { en: "SPIRULINA CANDY 500'PCS", ar: "سبيرولينا 500 قرص", dp: 74.20, rp: 95.00, pv: 31.45 },
  { en: "SPIRULINA CANDY 120'PCS", ar: "سبيرولينا 120 قرص", dp: 22.25, rp: 28.50, pv: 8.85 },
  { en: "SPIRULINA CEREAL30'S*30G", ar: "سبيرولينا سيريال 30 كيس", dp: 36.90, rp: 47.25, pv: 12.95 },
  { en: "LIONS MANE CANDY 120'PCS", ar: "عرف الأسد 120 قرص", dp: 31.65, rp: 40.50, pv: 11.75 },
  { en: "CORDYCEPS CANDY 120'PCS", ar: "كورديسيبس 120 قرص", dp: 71.65, rp: 91.70, pv: 28.15 },
  { en: "MYCOVEGGIE 400G", ar: "مايكوفيجي 400 جرام", dp: 69.30, rp: 88.70, pv: 28.95 },
  { en: "MYCOVITA POWDER 30'S X 12G", ar: "ميكوفيتا 30 كيس", dp: 325.40, rp: 416.50, pv: 123.25 }
];

let priceData = [];

export async function loadPriceList() {
  priceData = PRICE_LIST;
  console.log(`✅ تم تحميل ${priceData.length} منتج`);
  return priceData;
}

export function searchPriceList(query) {
  if (!priceData.length) return [];
  const keywords = query.split(/\s+/).filter(w => w.length > 2);
  const results = priceData.filter(p => {
    const lowerEn = p.en.toLowerCase();
    const lowerAr = p.ar.toLowerCase();
    return keywords.some(kw => lowerEn.includes(kw.toLowerCase()) || lowerAr.includes(kw.toLowerCase()));
  });
  if (results.length === 0) return priceData.slice(0, 5).map(p => ({ ...p, suggestion: true }));
  return results.slice(0, 10);
}

export function generatePriceTable(products, query) {
  if (!products.length) return `🔍 لم أجد منتجات تطابق "${query}".`;
  let table = `📊 *نتائج البحث عن: "${query}"*\n\n`;
  table += "```\n";
  table += "┌────┬──────────────────────────────────────────────────┬──────────┬──────────┬────────┐\n";
  table += "│ #  │ المنتج                                           │ العضو   │ غير عضو │ النقاط │\n";
  table += "├────┼──────────────────────────────────────────────────┼──────────┼──────────┼────────┤\n";
  let i = 1;
  for (const p of products) {
    const name = `${p.en}\n${p.ar}`;
    const lines = name.split('\n');
    table += `│ ${String(i).padStart(2)} │ ${lines[0].padEnd(48)}│ ${p.dp.toFixed(2).padStart(8)} │ ${p.rp.toFixed(2).padStart(8)} │ ${p.pv.toFixed(2).padStart(6)} │\n`;
    if (lines[1]) {
      table += `│    │ ${lines[1].padEnd(48)}│          │          │        │\n`;
    }
    i++;
  }
  table += "└────┴──────────────────────────────────────────────────┴──────────┴──────────┴────────┘\n";
  table += "```\n";
  table += `📌 *تم عرض ${products.length} منتج من أصل ${priceData.length} منتج.*\n`;
  table += `\n📎 *سأرسل لك الملف الآن لتطلع على القائمة الكاملة.*`;
  return table;
}

export async function sendPriceListPDF(userId, client) {
  const pdfPath = path.join(KNOWLEDGE_DIR, 'pdfs', 'قائمة أسعار المنتجات 2026.pdf');
  if (!await fs.pathExists(pdfPath)) {
    console.warn('⚠️ ملف PDF غير موجود');
    await client.sendMessage(userId, { message: '⚠️ عذراً، ملف PDF غير متوفر حالياً.' });
    return false;
  }
  try {
    await client.sendMessage(userId, {
      document: { file: pdfPath },
      caption: '📄 *قائمة أسعار المنتجات 2026 (كاملة)*'
    });
    return true;
  } catch (e) {
    console.error('❌ فشل إرسال PDF:', e.message);
    await client.sendMessage(userId, { message: '⚠️ تعذر إرسال ملف PDF، لكن يمكنك طلب المساعدة من الإدارة.' });
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

export default { loadKnowledge, searchInFiles, loadPriceList, searchPriceList, generatePriceTable, sendPriceListPDF };
