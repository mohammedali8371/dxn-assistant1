// ============================================================================
// logger.js — نظام تسجيل السجلات (Logging)
// ----------------------------------------------------------------------------
// - يستخدم مكتبة winston لتسجيل الأخطاء والمعلومات في مجلد logs/
// - ملف error.log للأخطاء فقط، وcombined.log لكل السجلات
// - عند التشغيل محلياً يطبع أيضاً في الطرفية، وعلى Render يُسجل في الملفات
// - ملاحظة: على Render لا نستطيع قراءة هذه الملفات مباشرة، لذا نعتمد
//   على نقاط التشخيص /admin و /diag في index.js
// ============================================================================
import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';

const logDir = path.join(process.cwd(), 'logs');
fs.ensureDirSync(logDir);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, category, ...meta }) =>
    `${timestamp} [${level}] ${category?`[${category}] `:''}${message} ${Object.keys(meta).length?JSON.stringify(meta):''}`
  )
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format,
  transports: [
    new winston.transports.File({ filename: path.join(logDir,'error.log'), level:'error' }),
    new winston.transports.File({ filename: path.join(logDir,'combined.log') }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) }));
}

logger.errorWithContext = function(msg, err, ctx={}) {
  this.error(msg, { ...ctx, error: { message: err.message, stack: err.stack, name: err.name } });
};

export { logger };
export default logger;
