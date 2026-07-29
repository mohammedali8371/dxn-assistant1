import fs from 'fs-extra';
import path from 'path';
import pdfParse from 'pdf-parse';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');
const PDF_DIR = path.join(KNOWLEDGE_DIR, 'pdfs');

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

// ===== تنظيف النص المستخرج =====
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF.,?!:;()\-\n]/g, ' ')
    .trim();
}

// ===== تحميل جميع المعرفة (مرة واحدة عند بدء التشغيل) =====
let KNOWLEDGE_CACHE = null;

export async function loadKnowledge() {
  if (KNOWLEDGE_CACHE) return KNOWLEDGE_CACHE;
  
  console.log('📚 جاري تحميل الملفات...');
  let allText = '';
  
  // قراءة ملفات TXT و MD
  const mainFiles = await fs.readdir(KNOWLEDGE_DIR).catch(() => []);
  for (const file of mainFiles) {
    if (file.endsWith('.txt') || file.endsWith('.md')) {
      const content = await fs.readFile(path.join(KNOWLEDGE_DIR, file), 'utf-8').catch(() => '');
      if (content) allText += cleanText(content) + '\n';
    }
  }
  
  // قراءة ملفات PDF
  const pdfFiles = await fs.readdir(PDF_DIR).catch(() => []);
  for (const file of pdfFiles) {
    if (file.endsWith('.pdf')) {
      console.log(`📄 قراءة PDF: ${file}`);
      const content = await extractPDFText(path.join(PDF_DIR, file));
      if (content) allText += cleanText(content) + '\n';
    }
  }
  
  KNOWLEDGE_CACHE = allText;
  console.log(`✅ تم تحميل ${KNOWLEDGE_CACHE.length} حرف من المعرفة`);
  return KNOWLEDGE_CACHE;
}

// ===== البحث عن معلومات ذات صلة بالسؤال =====
export async function searchInFiles(query) {
  const allText = await loadKnowledge();
  if (!allText || allText.length < 50) return { answer: null, context: null };
  
  // تقسيم النص إلى فقرات
  const paragraphs = allText.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  const keywords = query.split(/\s+/).filter(w => w.length > 2);
  
  const scored = paragraphs.map(p => {
    let score = 0;
    const lower = p.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) score += 5;
    }
    if (lower.includes(query.toLowerCase())) score += 20;
    if (lower.includes('dxn') || lower.includes('دي اكس ان')) score += 15;
    if (lower.includes('فرصة') || lower.includes('عمل') || lower.includes('تسويق')) score += 10;
    return { content: p.trim(), score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter(p => p.score > 5);
  
  if (top.length === 0) return { answer: null, context: null };
  
  let context = '';
  for (let i = 0; i < Math.min(top.length, 6); i++) {
    context += top[i].content + '\n\n';
  }
  return { answer: context.trim(), context: context.trim() };
}

export default { loadKnowledge, searchInFiles };
