import mongoose from 'mongoose';
import { logger } from './logger.js';
const { Schema } = mongoose;

// ===== النماذج =====
const UserSchema = new Schema({
  telegramId: { type: Number, required: true, unique: true, index: true },
  username: String, firstName: String, lastName: String, phone: String,
  isBot: { type: Boolean, default: false }, languageCode: { type: String, default: 'ar' },
  lastInteraction: { type: Date, default: Date.now }, isActive: { type: Boolean, default: true },
  preferences: { dialect: { type: String, default: 'ye' }, temperature: { type: Number, default: 0.7 } },
  stats: { messagesSent: { type: Number, default: 0 }, filesShared: { type: Number, default: 0 }, queriesCount: { type: Number, default: 0 } },
}, { timestamps: true });

const ConvSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  chatId: { type: Number, required: true, index: true },
  messages: [{ role: { type: String, enum: ['user','assistant','system'] }, content: String, timestamp: { type: Date, default: Date.now }, mediaType: { type: String, default: 'text' }, fileId: String }],
  maxMessages: { type: Number, default: 20 }, summary: String, lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });
ConvSchema.index({ userId: 1, chatId: 1 }, { unique: true });

const KnowSchema = new Schema({
  content: String, embedding: [Number], sourceFile: String, fileType: String,
  chunkIndex: Number, totalChunks: Number, metadata: Schema.Types.Mixed,
  addedAt: { type: Date, default: Date.now }, isActive: { type: Boolean, default: true }, retrievalCount: { type: Number, default: 0 },
}, { timestamps: true });

const LogSchema = new Schema({
  level: { type: String, enum: ['error','warn','info','debug'], required: true, index: true },
  message: String, meta: Schema.Types.Mixed, timestamp: { type: Date, default: Date.now, index: true },
  category: { type: String, enum: ['system','telegram','openai','rag','dashboard','user'], default: 'system' },
}, { timestamps: true });

const StatSchema = new Schema({
  date: { type: Date, required: true, unique: true, index: true },
  users: { total: Number, active: Number, new: Number },
  messages: { total: Number, text: Number, image: Number, audio: Number, video: Number, file: Number },
  ai: { totalRequests: Number, chatCompletions: Number, totalTokens: Number, estimatedCost: Number },
  rag: { totalQueries: Number, totalRetrievals: Number },
  system: { errors: Number },
}, { timestamps: true });
StatSchema.statics.increment = async function(date, field, val=1) {
  const upd = { $inc: {} };
  const parts = field.split('.');
  let cur = upd.$inc;
  for (let i=0; i<parts.length-1; i++) { cur[parts[i]] = cur[parts[i]]||{}; cur = cur[parts[i]]; }
  cur[parts[parts.length-1]] = val;
  return this.findOneAndUpdate({ date }, upd, { upsert: true, new: true });
};

export const User = mongoose.model('User', UserSchema);
export const Conversation = mongoose.model('Conversation', ConvSchema);
export const Knowledge = mongoose.model('Knowledge', KnowSchema);
export const Log = mongoose.model('Log', LogSchema);
export const Stat = mongoose.model('Stat', StatSchema);

// ===== اتصال قاعدة البيانات =====
export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('✅ MongoDB connected');
  } catch(e) { logger.error('❌ DB: '+e.message); process.exit(1); }
}

// ===== الذاكرة (المحادثات) =====
const MAX_MSGS = 20;
export async function getOrCreateConv(userId, chatId) {
  let conv = await Conversation.findOne({ userId, chatId });
  if (!conv) { conv = new Conversation({ userId, chatId, messages: [] }); await conv.save(); }
  return conv;
}
export async function addMessage(userId, chatId, role, content, mediaType='text', fileId='') {
  const conv = await getOrCreateConv(userId, chatId);
  conv.messages.push({ role, content, timestamp: new Date(), mediaType, fileId });
  if (conv.messages.length > MAX_MSGS) conv.messages = conv.messages.slice(-MAX_MSGS);
  conv.lastUpdated = new Date();
  await conv.save();
  return conv;
}
export async function getContext(userId, chatId, limit=MAX_MSGS) {
  const conv = await getOrCreateConv(userId, chatId);
  return conv.messages.slice(-limit).map(m => ({ role: m.role, content: m.content }));
}
export async function clearMemory(userId, chatId) {
  const conv = await getOrCreateConv(userId, chatId);
  conv.messages = []; conv.summary = ''; await conv.save(); return true;
}
export async function getMemoryStats() {
  const total = await Conversation.countDocuments();
  const agg = await Conversation.aggregate([{ $project:{ count:{$size:'$messages'} } }, { $group:{ _id:null, total:{$sum:'$count'} } }]);
  return { totalConversations: total, totalMessages: agg[0]?.total||0 };
}

export default { User, Conversation, Knowledge, Log, Stat, connectDB, getOrCreateConv, addMessage, getContext, clearMemory, getMemoryStats };
