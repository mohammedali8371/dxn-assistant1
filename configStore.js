// ============================================================================
// configStore.js — تخزين إعدادات البوت (Config Storage)
// ----------------------------------------------------------------------------
// - يحفظ/يقرأ إعدادات البوت في ملف bot_config.json داخل مجلد المشروع
// - المحتوى: الأدمنز، وضع DXN فقط، رسائل البداية/الترحيب، ردود "كيف حالك"،
//   رد السؤال غير المرتبط بـ DXN، الشخصية، قائمة المستخدمين المُرحب بهم
// - الدوال: getConfig (قراءة)، saveConfig (حفظ جزئي)، isAdmin/addAdmin/removeAdmin
// ============================================================================
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(process.cwd(), 'bot_config.json');

const DEFAULT_CONFIG = {
  admins: [7958260008],
  dxnOnly: true,
  startupText: `📘 *كيف تبدأ مع DXN؟*

مرحباً! للانضمام إلى DXN والبدء في تحقيق دخل، يرجى التواصل معنا مباشرة:

📱 *تيليجرام:* [@k_i_i8](https://t.me/k_i_i8)
📞 *واتساب:* [+967 776 383 577](https://wa.me/967776383577)

سنساعدك في خطوات التسجيل والانضمام، ونقدّم لك كل الدعم اللازم.`,
  greetingText: `السلام عليكم ورحمة الله وبركاته. أهلاً وسهلاً بك.

سعيد بتواصلك معنا، قبل ما أشرح لك فكرة المشروع أحب أفهم وضعك أكثر عشان أقدر أقدّم لك معلومات تناسبك.

١) إيش هدفك الأساسي من البحث عن الفرصة هذي؟ دخل إضافي؟ مشروع أكبر؟ ولا مجرد استكشاف لمعرفة الخيارات؟

٢) حالياً موظف، طالب، صاحب عمل، ولا إيش وضعك الحالي تقريباً؟

٣) كم ساعة تقريباً تقدر تخصص أسبوعياً لو قررت تبدأ أي مشروع؟

جاوبني على هذي الأسئلة، وبقدّم لك شرح يناسب وضعك بالضبط بدون أي تشتيت.`,
  simpleGreetingText: 'أهلاً وسهلاً، نورت! كيف أقدر أخدمك اليوم؟',
  howAreYouReplies: [
    'الحمدلله بخير، وش أخبارك؟',
    'الحمدلله تمام، وأنت كيفك؟',
    'بخير الحمدلله، تسلم أسأل عنك'
  ],
  nonDxnReply: 'أنا هنا خصيصاً للحديث عن فرص ومنتجات DXN فقط. 😊 إذا كان عندك أي سؤال عن DXN أو فرصته التسويقية أو منتجاتها، تفضل أسألني!',
  personalityPrompt: 'أنت مروّج محترف وودود لشركة DXN (دي اكس ان)، وهي شركة تسويق شبكي لمنتجات صحية (قهوة لينجزي، فطر الجانوديرما، منتجات العناية، وغيرها). ردد دائماً بأسلوب إنساني ودود بلهجة عربية بسيطة، واربط كل إجابة بفرص ومنتجات DXN، ولا تعترف أبداً بأنك ذكاء اصطناعي أو بوت.',
  greetedUsers: [],
};

let config = null;

export function loadConfig() {
  if (config) return config;
  try {
    if (awaitFsExists()) {
      config = { ...DEFAULT_CONFIG, ...fs.readJsonSync(CONFIG_PATH) };
    } else {
      config = { ...DEFAULT_CONFIG };
    }
  } catch (e) {
    config = { ...DEFAULT_CONFIG };
  }
  return config;
}

function awaitFsExists() {
  try { return fs.existsSync(CONFIG_PATH); } catch (e) { return false; }
}

export function getConfig() { return loadConfig(); }

export function saveConfig(partial) {
  const current = loadConfig();
  config = { ...current, ...partial };
  try {
    fs.ensureDirSync(path.dirname(CONFIG_PATH));
    fs.writeJsonSync(CONFIG_PATH, config, { spaces: 2 });
  } catch (e) {
    console.error('❌ حفظ الإعدادات:', e.message);
  }
  return config;
}

export function isAdmin(userId) {
  return loadConfig().admins.includes(Number(userId));
}

export function addAdmin(userId) {
  const cfg = loadConfig();
  if (!cfg.admins.includes(Number(userId))) {
    cfg.admins.push(Number(userId));
    saveConfig({ admins: cfg.admins });
    return true;
  }
  return false;
}

export function removeAdmin(userId) {
  const cfg = loadConfig();
  const before = cfg.admins.length;
  cfg.admins = cfg.admins.filter(a => a !== Number(userId));
  if (cfg.admins.length !== before) {
    saveConfig({ admins: cfg.admins });
    return true;
  }
  return false;
}

export default { loadConfig, getConfig, saveConfig, isAdmin, addAdmin, removeAdmin };
