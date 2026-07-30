import fs from 'fs-extra';
import path from 'path';
import pdfParse from 'pdf-parse';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');
const PDF_DIR = path.join(KNOWLEDGE_DIR, 'pdfs');

// ===== تخزين بيانات الأسعار =====
let priceData = [];

// ===== استخراج النص من PDF =====
async function extractPDFText(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (e) {
    console.error('PDF parse error:', e.message);
    return '';
  }
}

// ===== تحليل نص الجدول واستخراج المنتجات =====
function parsePriceTable(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 10);
  const products = [];
  let currentProduct = null;

  for (const line of lines) {
    // تجاهل الأسطر التي تحتوي على عناوين الأعمدة أو التذييلات
    if (line.includes('سعر العضو') || line.includes('سعر غير العضو') || line.includes('عدد النقاط')) continue;
    if (line.includes('PERSONAL CARE') || line.includes('FOOD & PEVERAGE') || line.includes('HEALTH FOOD')) continue;
    if (line.trim().length < 20) continue;

    // محاولة استخراج البيانات باستخدام تعبيرات منتظمة
    // الصيغة المتوقعة: اسم المنتج (قد يكون طويلاً) ثم الأرقام
    const match = line.match(/^(.+?)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)/);
    if (match) {
      const name = match[1].trim();
      const dp = parseFloat(match[2]);
      const rp = parseFloat(match[3]);
      const pv = parseFloat(match[4]);
      if (!isNaN(dp) && !isNaN(rp) && !isNaN(pv)) {
        products.push({ name, dp, rp, pv });
      }
    } else {
      // محاولة بديلة: البحث عن أرقام في السطر
      const numbers = line.match(/\d+\.?\d*/g);
      if (numbers && numbers.length >= 3) {
        const name = line.replace(/\d+\.?\d*/g, '').trim();
        const dp = parseFloat(numbers[0]);
        const rp = parseFloat(numbers[1]);
        const pv = parseFloat(numbers[2]);
        if (!isNaN(dp) && !isNaN(rp) && !isNaN(pv) && name.length > 3) {
          products.push({ name, dp, rp, pv });
        }
      }
    }
  }
  return products;
}

// ===== تحميل قائمة الأسعار من ملف PDF =====
export async function loadPriceList() {
  const filePath = path.join(PDF_DIR, 'قائمة أسعار المنتجات 2026.pdf');
  if (!await fs.pathExists(filePath)) {
    console.warn('⚠️ ملف الأسعار غير موجود:', filePath);
    return [];
  }
  console.log('📄 جاري تحميل قائمة الأسعار...');
  const text = await extractPDFText(filePath);
  const products = parsePriceTable(text);
  priceData = products;
  console.log(`✅ تم تحميل ${products.length} منتج من قائمة الأسعار.`);
  return products;
}

// ===== البحث في قائمة الأسعار حسب الاستعلام =====
export function searchPriceList(query) {
  if (!priceData.length) return [];
  const keywords = query.split(/\s+/).filter(w => w.length > 2);
  const results = priceData.filter(p => {
    const lowerName = p.name.toLowerCase();
    return keywords.some(kw => lowerName.includes(kw.toLowerCase()));
  });
  // إذا لم تكن هناك نتائج، نرجع أول 5 منتجات كاقتراح
  if (results.length === 0) {
    return priceData.slice(0, 5).map(p => ({ ...p, suggestion: true }));
  }
  return results.slice(0, 10); // نحدد النتائج بـ 10 كحد أقصى
}

// ===== دالة للحصول على رد نصي منسق =====
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
  reply += `\n📄 *للحصول على القائمة الكاملة، سأرسل لك ملف PDF يحتوي على جميع المنتجات والأسعار.*`;
  return reply;
}

// ===== إرسال ملف PDF =====
export async function sendPriceListPDF(chatId, client) {
  const filePath = path.join(PDF_DIR, 'قائمة أسعار المنتجات 2026.pdf');
  if (!await fs.pathExists(filePath)) {
    return false;
  }
  try {
    await client.sendMessage(chatId, {
      document: { file: filePath },
      caption: '📄 *قائمة أسعار المنتجات 2026 (كاملة)*\nجميع المنتجات مع الأسعار والنقاط.'
    });
    return true;
  } catch (e) {
    console.error('❌ فشل إرسال ملف PDF:', e.message);
    return false;
  }
}

// ===== تحميل المعرفة العامة (للتوافق مع الكود القديم) =====
let KNOWLEDGE_CACHE = null;

export async function loadKnowledge() {
  if (KNOWLEDGE_CACHE) return KNOWLEDGE_CACHE;
  console.log('📚 جاري تحميل المعرفة العامة...');
  let allText = '';
  const mainFiles = await fs.readdir(KNOWLEDGE_DIR).catch(() => []);
  for (const file of mainFiles) {
    if (file.endsWith('.txt') || file.endsWith('.md')) {
      const content = await fs.readFile(path.join(KNOWLEDGE_DIR, file), 'utf-8').catch(() => '');
      if (content) allText += content + '\n';
    }
  }
  KNOWLEDGE_CACHE = allText;
  console.log(`✅ تم تحميل ${KNOWLEDGE_CACHE.length} حرف من المعرفة العامة.`);
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
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) score += 5;
    }
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
