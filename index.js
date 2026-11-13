import express from 'express';
import fileUpload from 'express-fileupload';
import session from 'express-session';
import mongoose from 'mongoose';
import cron from 'node-cron';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import mime from 'mime-types';
import multer from 'multer';
import nodemailer from 'nodemailer';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import compression from 'compression';
import os from 'os';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(compression());
app.set('etag', false);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
app.use(cookieParser());
app.set('trust proxy', 1);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arulz-xd-owner:Haqqi0213@cluster0.fgxhxqm.mongodb.net/?appName=Cluster0'; 

let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn && mongoose.connection.readyState === 1) {
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10
        }).then((mongooseInstance) => {
            console.log('📦 Berhasil terhubung ke Database Utama!');
            return mongooseInstance;
        }).catch((err) => {
            cached.promise = null;
            console.error('❌ Gagal koneksi ke Database:', err);
            throw err;
        });
    }

    cached.conn = await cached.promise;
    return cached.conn;
}

// Jalankan inisialisasi koneksi
const dbPromise = connectDB();

const JWT_SECRET = process.env.JWT_SECRET || 'arulzxd-super-secret-jwt-key-999';

// USER SCHEMA V2
const userSchemaV2 = new mongoose.Schema({
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, default: null },
    provider: { type: String, default: 'local' },
    providerId: { type: String, default: null },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    avatar: { type: String, default: 'https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png' }, 
    banner: { type: String, default: 'https://cdn.larasxd.my.id/files/Tk4GavOaHEEP2ykm.mp4' },
    saldo: { type: Number, default: 0 },
    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const UserV2 = mongoose.models.UserV2 || mongoose.model('UserV2', userSchemaV2);

// SCHEMA VERIFIKASI OTP 6 DIGIT
const verificationCodeSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true },
    type: { type: String, enum: ['login', 'register', 'forgot'], required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now, expires: 600 } // Auto hapus 10 menit
});

const VerificationCode = mongoose.models.VerificationCode || mongoose.model('VerificationCode', verificationCodeSchema);

// SCHEMA PENCATATAN BATAS MAKSIMAL PENGIRIMAN EMAIL (MAKS 5x SEHARI)
const emailLimitSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    date: { type: String, required: true },
    count: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 172800 }
});

const EmailLimit = mongoose.models.EmailLimit || mongoose.model('EmailLimit', emailLimitSchema);

function generateReferralCode() {
    return 'REF' + Math.floor(100000 + Math.random() * 900000);
}

// HELPER PENGIRIMAN EMAIL OTP MAKSIMAL 5 KALI SEHARI
async function checkAndIncrementEmailLimit(email) {
    const today = new Date().toISOString().split('T')[0];
    const cleanEmail = email.toLowerCase().trim();

    let limitRecord = await EmailLimit.findOne({ email: cleanEmail, date: today });
    if (!limitRecord) {
        limitRecord = new EmailLimit({ email: cleanEmail, date: today, count: 0 });
    }

    if (limitRecord.count >= 5) {
        return false;
    }

    limitRecord.count += 1;
    await limitRecord.save();
    return true;
}

// HELPER NODEMAILER OTP EMAIL
async function sendEmailOTP(email, code, typeTitle) {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, 
        auth: {
            user: 'servicearulzxd@gmail.com',
            pass: 'cyljwyaxcjvmqxdm'
        },
        tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
        from: '"Support ArulzXD" <servicearulzxd@gmail.com>',
        to: email,
        subject: `Kode Verifikasi ${typeTitle} - ArulzXD Store`,
        html: `
<div style="background-color: #F5F2EB; padding: 40px 20px; font-family: 'Plus Jakarta Sans', sans-serif;">
    <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border: 4px solid #000000; box-shadow: 6px 6px 0px #000000; padding: 32px; border-radius: 16px;">
        <h1 style="margin: 0 0 16px 0; color: #000000; font-size: 24px; font-weight: 900; text-transform: uppercase;">
            Arulz<span style="color: #00E5FF;">XD</span> Store
        </h1>
        <hr style="border: none; border-top: 3px solid #000000; margin-bottom: 20px;">
        <p style="margin: 0 0 12px 0; color: #000000; font-size: 14px; font-weight: 700;">Halo,</p>
        <p style="margin: 0 0 20px 0; color: #333333; font-size: 13px; line-height: 1.6;">
            Berikut adalah kode verifikasi 6 digit Anda untuk **${typeTitle}**. Kode ini hanya berlaku selama <strong>10 menit</strong>.
        </p>
        
        <div style="background-color: #FFDE59; border: 3px solid #000000; box-shadow: 4px 4px 0px #000000; padding: 18px; text-align: center; margin-bottom: 24px; border-radius: 12px;">
            <span style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #000000;">${code}</span>
        </div>

        <p style="margin: 0; color: #666666; font-size: 11px; line-height: 1.5;">
            * Peringatan: Jangan berikan kode ini kepada siapapun demi keamanan akun Anda. Pengiriman kode dibatasi maksimal 5 kali sehari.
        </p>
    </div>
</div>
`
    };

    await transporter.sendMail(mailOptions);
}

// PRODUCT SCHEMA V2
const productSchemaV2 = new mongoose.Schema({
    Id: { type: String, required: true, unique: true, trim: true },
    nama: { type: String, required: true, trim: true },
    harga: { type: Number, required: true },
    harga_diskon: { type: Number, default: null },
    kategori: { type: String, required: true },
    badge: { type: String, default: "" },
    terjual: { type: Number, default: 0 },
    stok: { type: Number, default: 0 },
    gambar: { 
        type: [String], 
        default: ["https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png"] 
    },    
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    purchasedBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

const ProductV2 = mongoose.models.ProductV2 || mongoose.model('ProductV2', productSchemaV2);

// REVIEW SCHEMA V2
const reviewSchemaV2 = new mongoose.Schema({
    productId: { type: String, required: true, index: true },
    userId: { type: String, default: null, index: true },
    username: { type: String, required: true },
    userAvatar: { type: String, default: 'https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
    media: [{
        type: { type: String, enum: ['image', 'video'] },
        url: String
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

reviewSchemaV2.index({ productId: 1, userId: 1 }, { unique: true, sparse: true });
const ReviewV2 = mongoose.models.ReviewV2 || mongoose.model('ReviewV2', reviewSchemaV2);

// CACHE SCHEMA V2
const cacheSchemaV2 = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 } 
});

const CacheV2 = mongoose.models.CacheV2 || mongoose.model('CacheV2', cacheSchemaV2);

// VOUCHER SCHEMA V2
const voucherSchemaV2 = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discount: { type: Number, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    expiredAt: { type: Date, required: true },
    usageLimit: { type: Number, default: 20 },
    usedCount: { type: Number, default: 0 },
    usedBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

const VoucherV2 = mongoose.models.VoucherV2 || mongoose.model('VoucherV2', voucherSchemaV2);

// TRANSACTION SCHEMA V2
const transactionSchemaV2 = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    paymentNumber: { type: String, default: null }, 
    paymentMethod: { type: String, default: "QRIS" },
    type: { type: String, enum: ['PURCHASE', 'DEPOSIT'], default: 'PURCHASE' },
    userEmail: { type: String, default: null, index: true },
    status: { type: String, default: "pending" }, 
    itemDetails: {
        nama: String,
        harga: Number,
        harga_diskon: Number,
        harga_setelah_voucher: Number,
        kategori: String,
        gambar: String,
        link: String,
        buyer: String,
        qty: Number
    },
    productLink: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiredAt: { type: Date, required: true },
    updatedAt: { type: Date, default: Date.now }
});

const TransactionV2 = mongoose.models.TransactionV2 || mongoose.model('TransactionV2', transactionSchemaV2);

// ANALYTICS METRICS SCHEMA V2
const systemMetricsSchemaV2 = new mongoose.Schema({
    path: { type: String, required: true },
    method: { type: String, default: 'GET' },
    responseTimeMs: { type: Number, required: true },
    statusCode: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now, index: true }
});

const SystemMetricsV2 = mongoose.models.SystemMetricsV2 || mongoose.model('SystemMetricsV2', systemMetricsSchemaV2);

// CHAT MESSAGE SCHEMA & MODEL
const chatMessageSchema = new mongoose.Schema({
    userEmail: { type: String, required: true, index: true },
    sender: { type: String, enum: ['user', 'owner', 'admin'], required: true },
    senderName: { type: String, default: 'Guest' },
    message: { type: String, required: true, trim: true },
    readByAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

// MIDDLEWARES & UTILS
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', async () => {
        try {
            const duration = Date.now() - start;
            if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/transactions') || req.originalUrl === '/') {
                await SystemMetricsV2.create({
                    path: req.path,
                    method: req.method,
                    responseTimeMs: duration,
                    statusCode: res.statusCode,
                    timestamp: new Date()
                });
            }
        } catch (e) {}
    });
    next();
});

app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error('Database connection middleware error:', err.message);
        res.status(503).json({ status: false, message: 'Database sedang bersiap, silakan muat ulang halaman.' });
    }
});

app.use(session({
    secret: 'arulzxd_secret_session_key_99', 
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        clientPromise: dbPromise.then(m => m.connection.getClient()),
        dbName: 'sessions',
        ttl: 24 * 60 * 60
    }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 } 
}));

const checkAuthSession = (req, res, next) => {
    const token = req.cookies.auth_session;
    if (!token) {
        req.user = null;
        return next();
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (err) {
        res.clearCookie('auth_session');
        req.user = null;
        next();
    }
};

app.use(checkAuthSession);

function getUserIdentifier(req) {
    if (req.user) {
        return (req.user.email || req.user.username || req.user._id || "").toString().toLowerCase().trim();
    }
    const bodyIdentifier = req.body?.username || req.body?.email || req.body?.userIdentifier;
    if (bodyIdentifier) {
        return bodyIdentifier.toString().toLowerCase().trim();
    }
    return req.ip; 
}

const checkAdminRole = (req, res, next) => {
    if (!req.user) return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu!' });
    const ownerEmail = 'haqqi.official13@gmail.com';
    if (req.user.email?.toLowerCase().trim() === ownerEmail) {
        req.isAdmin = true;
        return next();
    }
    return res.status(403).json({ status: false, message: 'Akses ditolak! Khusus Admin/Owner.' });
};

// CHAT BANTUAN API
app.get('/api/bantuan/messages', checkAuthSession, async (req, res) => {
    try {
        const userIdentifier = getUserIdentifier(req);
        const messages = await ChatMessage.find({ userEmail: userIdentifier }).sort({ createdAt: 1 }).lean();
        return res.json({ status: true, messages });
    } catch (e) {
        return res.status(500).json({ status: false, message: 'Gagal memuat pesan live chat.' });
    }
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9289940600:AAF3_XHJlcfiD9be8KzNNw-7crGoOaenSyU';
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '-1004312316684';

async function sendTelegramNotification(username, userEmail, messageText) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) return;

    const escapeHtml = (str) => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const text = `
📩 <b>PESAN LIVE CHAT BARU!</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Username:</b> ${escapeHtml(username)}
📧 <b>Email:</b> <code>${escapeHtml(userEmail)}</code>
💬 <b>Percakapan:</b>
${escapeHtml(messageText)}
━━━━━━━━━━━━━━━━━━━━
🔗 <a href="https://arulzxd.biz.id/admin/livechat">Buka Panel Admin Live Chat</a>
    `.trim();

    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_ADMIN_CHAT_ID,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        }, { timeout: 8000 });
    } catch (error) {
        console.error('❌ Gagal mengirim notifikasi ke Telegram:', error.response?.data || error.message);
    }
}

app.post('/api/bantuan/send-user', checkAuthSession, async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ status: false, message: 'Pesan tidak boleh kosong!' });
        }

        const userIdentifier = getUserIdentifier(req);
        let displayUsername = 'Pengguna Guest';
        let displayEmail = userIdentifier;
        
        if (req.user) {
            const activeUser = await UserV2.findById(req.user.id || req.user._id).select('username email').lean();
            displayUsername = activeUser?.username || req.user.username || req.user.name || 'User';
            displayEmail = (activeUser?.email || req.user.email || userIdentifier).toLowerCase().trim();
        }

        const cleanMessage = message.trim();

        const newMsg = new ChatMessage({
            userEmail: displayEmail,
            sender: 'user',
            senderName: displayUsername,
            message: cleanMessage,
            readByAdmin: false
        });

        await newMsg.save();

        await sendTelegramNotification(displayUsername, displayEmail, cleanMessage);

        return res.json({ status: true, message: 'Pesan berhasil dikirim!', data: newMsg });
    } catch (e) {
        return res.status(500).json({ status: false, message: 'Gagal mengirim pesan.' });
    }
});

app.get('/api/bantuan/admin/users', checkAuthSession, checkAdminRole, async (req, res) => {
    try {
        const rooms = await ChatMessage.aggregate([
            { $sort: { createdAt: -1 } },
            { 
                $group: {
                    _id: "$userEmail",
                    lastMessage: { $first: "$message" },
                    senderName: { $first: "$senderName" },
                    lastSender: { $first: "$sender" },
                    updatedAt: { $first: "$createdAt" },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ["$sender", "user"] }, { $eq: ["$readByAdmin", false] }] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            { $sort: { updatedAt: -1 } }
        ]);

        const emails = rooms.map(r => r._id).filter(e => e && e.includes('@'));
        const dbUsers = await UserV2.find({ email: { $in: emails } }).select('email username avatar').lean();
        const userMap = {};
        dbUsers.forEach(u => {
            userMap[u.email.toLowerCase().trim()] = u;
        });

        const formattedUsers = rooms.map(r => {
            const cleanEmail = (r._id || '').toLowerCase().trim();
            const matchedUser = userMap[cleanEmail];
            const isRegisteredEmail = cleanEmail.includes('@');

            let resolvedUsername = matchedUser?.username;
            if (!resolvedUsername) {
                resolvedUsername = (r.senderName && r.senderName !== 'Cs Owner')
                    ? r.senderName
                    : (isRegisteredEmail ? cleanEmail.split('@')[0] : 'Pengguna Guest');
            }

            return {
                userId: r._id,
                username: resolvedUsername,
                email: isRegisteredEmail ? cleanEmail : `Guest (${cleanEmail})`,
                avatar: matchedUser?.avatar || null,
                lastMessage: r.lastMessage,
                unreadCount: r.unreadCount,
                updatedAt: r.updatedAt
            };
        });

        return res.json({ status: true, users: formattedUsers });
    } catch (e) {
        return res.status(500).json({ status: false, message: 'Gagal memuat daftar pengguna chat.' });
    }
});

app.get('/api/bantuan/admin/messages/:userId', checkAuthSession, checkAdminRole, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) return res.status(400).json({ status: false, message: 'ID/Email pengguna wajib ada!' });

        const cleanId = userId.toLowerCase().trim();
        const messages = await ChatMessage.find({ userEmail: cleanId }).sort({ createdAt: 1 }).lean();

        await ChatMessage.updateMany(
            { userEmail: cleanId, sender: 'user', readByAdmin: false },
            { $set: { readByAdmin: true } }
        );

        return res.json({ status: true, messages });
    } catch (e) {
        return res.status(500).json({ status: false, message: 'Gagal memuat riwayat pesan pengguna.' });
    }
});

app.post('/api/bantuan/admin/reply', checkAuthSession, checkAdminRole, async (req, res) => {
    try {
        const { userId, message } = req.body;
        if (!userId || !message || !message.trim()) {
            return res.status(400).json({ status: false, message: 'ID Pengguna dan pesan balasan wajib diisi!' });
        }

        const replyMsg = new ChatMessage({
            userEmail: userId.toLowerCase().trim(),
            sender: 'owner',
            senderName: 'Cs Owner',
            message: message.trim(),
            readByAdmin: true
        });

        await replyMsg.save();
        return res.json({ status: true, message: 'Balasan admin berhasil terkirim!', data: replyMsg });
    } catch (e) {
        return res.status(500).json({ status: false, message: 'Gagal mengirim balasan admin.' });
    }
});

app.get('/admin/livechat', checkAuthSession, (req, res) => {
    const ownerEmail = 'haqqi.official13@gmail.com';
    if (!req.user || req.user.email?.toLowerCase().trim() !== ownerEmail) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin-chat.html'));
});

app.post('/api/user/update-username', checkAuthSession, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu!' });
        }

        const newUsername = req.body.username;
        if (!newUsername || !newUsername.trim()) {
            return res.status(400).json({ status: false, message: 'Username baru tidak boleh kosong!' });
        }

        const cleanUsername = newUsername.trim();
        const userId = req.user.id || req.user._id;

        const updatedUser = await UserV2.findByIdAndUpdate(
            userId,
            { $set: { username: cleanUsername } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ status: false, message: 'User tidak ditemukan.' });
        }

        const userPayload = {
            id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            name: updatedUser.username,
            avatar: updatedUser.avatar,
            createdAt: updatedUser.createdAt
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('auth_session', token, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: true,
            sameSite: 'lax'
        });

        return res.json({
            status: true,
            message: 'Username berhasil diperbarui!',
            username: updatedUser.username
        });
    } catch(err) {
        return res.status(500).json({ status: false, message: 'Gagal memperbarui username.' });
    }
});

const uploadavatar = multer({ 
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('File harus berupa gambar!'));
        }
    }
});

app.post('/api/user/update-avatar', checkAuthSession, (req, res) => {
    uploadavatar.single('avatar')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: false, message: err.message || 'Gagal mengunggah gambar.' });
        }

        try {
            if (!req.user) {
                return res.status(401).json({ status: false, message: 'Anda belum login!' });
            }

            if (!req.file) {
                return res.status(400).json({ status: false, message: 'Silakan pilih gambar terlebih dahulu!' });
            }

            const mimeType = req.file.mimetype || mime.lookup(req.file.originalname) || 'image/png';
            const base64 = req.file.buffer.toString("base64");
            const avatarDataUrl = `data:${mimeType};base64,${base64}`;

            const userIdToUpdate = req.user.id || req.user._id;
            const updatedUser = await UserV2.findByIdAndUpdate(
                userIdToUpdate,
                { $set: { avatar: avatarDataUrl } },
                { new: true, runValidators: true }
            );

            if (!updatedUser) {
                return res.status(404).json({ status: false, message: 'User tidak ditemukan.' });
            }

            const userPayload = {
                id: updatedUser._id,
                username: updatedUser.username,
                email: updatedUser.email,
                name: updatedUser.username,
                avatar: updatedUser.avatar,
                createdAt: updatedUser.createdAt
            };

            const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
            res.cookie('auth_session', token, {
                maxAge: 7 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                secure: true,
                sameSite: 'lax'
            });

            return res.json({
                status: true,
                message: 'Avatar berhasil diperbarui!',
                avatar: updatedUser.avatar
            });

        } catch (error) {
            console.error("Gagal update avatar:", error);
            return res.status(500).json({ status: false, message: 'Terjadi kesalahan pada server saat memperbarui avatar.' });
        }
    });
});

const uploadBannerMulter = multer({ 
    limits: { fileSize: 4 * 1024 * 1024 }, // Batas maksimal upload 4MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('File banner harus berupa gambar (JPG/PNG/GIF) atau video MP4!'));
        }
    }
});

app.post('/api/user/update-banner', checkAuthSession, (req, res) => {
    uploadBannerMulter.single('bannerFile')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ status: false, message: 'Ukuran berkas melebihi batas maksimal 4MB!' });
            }
            return res.status(400).json({ status: false, message: err.message || 'Gagal mengunggah banner.' });
        }

        try {
            if (!req.user) {
                return res.status(401).json({ status: false, message: 'Anda belum login!' });
            }

            const userIdToUpdate = req.user.id || req.user._id;
            const bannerUrlInput = req.body.bannerUrl;

            let finalBanner = '';

            // JIKA UPLOAD DENGAN FILE
            if (req.file) {
                const fileSize = req.file.size;
                const maxSize = 4 * 1024 * 1024; // Maksimal 4 MB

                if (fileSize > maxSize) {
                    return res.status(400).json({ 
                        status: false, 
                        message: `Ukuran file berkas maksimal adalah 4MB! (Ukuran file Anda: ${(fileSize / (1024*1024)).toFixed(2)}MB)` 
                    });
                }

                // Konversi berkas ke Base64
                const mimeType = req.file.mimetype || mime.lookup(req.file.originalname) || 'image/png';
                const base64 = req.file.buffer.toString("base64");
                finalBanner = `data:${mimeType};base64,${base64}`;
            } 
            // JIKA MENGGUNAKAN LINK URL
            else if (bannerUrlInput && bannerUrlInput.trim() !== '') {
                finalBanner = bannerUrlInput.trim();
            } else {
                return res.status(400).json({ status: false, message: 'Silakan pilih berkas upload (Maks. 4MB) atau masukkan URL Link banner!' });
            }

            const updatedUser = await UserV2.findByIdAndUpdate(
                userIdToUpdate,
                { $set: { banner: finalBanner } },
                { new: true, runValidators: true }
            );

            if (!updatedUser) {
                return res.status(404).json({ status: false, message: 'User tidak ditemukan.' });
            }

            return res.json({
                status: true,
                message: 'Banner profil berhasil diperbarui!',
                banner: updatedUser.banner
            });

        } catch (error) {
            console.error("Gagal update banner:", error);
            return res.status(500).json({ status: false, message: 'Terjadi kesalahan pada server saat memperbarui banner.' });
        }
    });
});


const uploadReviewMedia = multer({
    limits: { fileSize: 10 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('File harus berupa gambar atau video!'));
        }
    }
});

app.post('/api/reviews', checkAuthSession, (req, res) => {
    uploadReviewMedia.array('mediaFiles', 5)(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: false, message: err.message || 'Gagal mengunggah berkas.' });
        }

        try {
            if (!req.user) {
                return res.status(401).json({ 
                    status: false, 
                    message: 'Anda wajib login terlebih dahulu untuk memberikan ulasan!' 
                });
            }

            const { productId, rating, comment } = req.body;

            if (!productId) {
                return res.status(400).json({ status: false, message: 'Product ID wajib diisi!' });
            }

            if (!rating || Number(rating) < 1 || Number(rating) > 5) {
                return res.status(400).json({ status: false, message: 'Rating bintang wajib diisi (1-5)!' });
            }

            if (!comment || !comment.trim()) {
                return res.status(400).json({ status: false, message: 'Anda diwajibkan menuliskan ulasan/penilaian!' });
            }

            const username = req.user.username || req.user.name;
            const userAvatar = req.user.avatar || 'https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png';
            const userId = (req.user.id || req.user._id).toString();
            const userEmail = (req.user.email || "").toLowerCase().trim();

            const product = await ProductV2.findOne({
                $or: [{ Id: productId }, { _id: mongoose.Types.ObjectId.isValid(productId) ? productId : null }]
            });

            if (!product) {
                return res.status(404).json({ status: false, message: 'Produk tidak ditemukan.' });
            }

            const purchasedList = (product.purchasedBy || []).map(p => p.toLowerCase().trim());
            const isBuyer = purchasedList.some(p => 
                p === userEmail || 
                p === username.toLowerCase() || 
                p === userId.toLowerCase()
            );

            if (!isBuyer) {
                return res.status(403).json({
                    status: false,
                    message: 'Anda belum pernah membeli produk ini, tidak dapat memberikan penilaian!'
                });
            }

            const mediaList = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const mimeType = file.mimetype || mime.lookup(file.originalname) || '';
                    const isVideo = mimeType.startsWith('video/');
                    const base64 = file.buffer.toString('base64');
                    const dataUrl = `data:${mimeType};base64,${base64}`;

                    mediaList.push({
                        type: isVideo ? 'video' : 'image',
                        url: dataUrl
                    });
                }
            }

            let existingReview = await ReviewV2.findOne({ productId, userId });

            if (existingReview) {
                existingReview.rating = Number(rating);
                existingReview.comment = comment.trim();
                if (mediaList.length > 0) {
                    existingReview.media = mediaList; 
                }
                existingReview.updatedAt = new Date();
                await existingReview.save();

                return res.json({
                    status: true,
                    message: 'Penilaian produk Anda berhasil diperbarui!',
                    data: existingReview
                });
            } else {
                const newReview = new ReviewV2({
                    productId,
                    userId,
                    username,
                    userAvatar,
                    rating: Number(rating),
                    comment: comment.trim(),
                    media: mediaList
                });

                await newReview.save();

                return res.json({
                    status: true,
                    message: 'Penilaian produk berhasil dikirim!',
                    data: newReview
                });
            }

        } catch (error) {
            console.error("Error submit review:", error);
            return res.status(500).json({ status: false, message: 'Terjadi kesalahan server saat menyimpan ulasan.' });
        }
    });
});

app.get('/api/reviews/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const reviews = await ReviewV2.find({ productId }).sort({ createdAt: -1 }).lean();

        const userIds = reviews.map(r => r.userId).filter(Boolean);
        const users = await UserV2.find({ _id: { $in: userIds } }).select('_id avatar username').lean();
        
        const userMap = {};
        users.forEach(u => {
            userMap[u._id.toString()] = u;
        });

        const updatedReviews = reviews.map(rev => {
            if (rev.userId && userMap[rev.userId]) {
                return {
                    ...rev,
                    userAvatar: userMap[rev.userId].avatar || rev.userAvatar,
                    username: userMap[rev.userId].username || rev.username
                };
            }
            return rev;
        });

        let averageRating = 0;
        if (updatedReviews.length > 0) {
            const totalRating = updatedReviews.reduce((sum, item) => sum + item.rating, 0);
            averageRating = Number((totalRating / updatedReviews.length).toFixed(1));
        }

        return res.json({
            status: true,
            totalReviews: updatedReviews.length,
            averageRating: averageRating,
            reviews: updatedReviews
        });
    } catch (error) {
        console.error("Error fetch reviews:", error);
        return res.status(500).json({ status: false, message: 'Gagal mengambil ulasan produk.' });
    }
});

app.delete('/api/reviews/:reviewId', checkAuthSession, async (req, res) => {
    try {
        const { reviewId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(reviewId)) {
            return res.status(400).json({ status: false, message: 'ID ulasan tidak valid!' });
        }

        const review = await ReviewV2.findById(reviewId);

        if (!review) {
            return res.status(404).json({ status: false, message: 'Ulasan tidak ditemukan!' });
        }

        let currentUserId = getUserIdentifier(req);
        if (req.user) {
            currentUserId = (req.user.id || req.user._id || req.user.email || req.user.username).toString();
        }

        const currentUsername = req.user ? req.user.username : null;

        const isOwner = (review.userId && review.userId.toString() === currentUserId.toString()) ||
                        (currentUsername && review.username.toLowerCase() === currentUsername.toLowerCase());

        if (!isOwner) {
            return res.status(403).json({ status: false, message: 'Anda tidak memiliki hak akses untuk menghapus ulasan ini!' });
        }

        await ReviewV2.findByIdAndDelete(reviewId);

        return res.json({ status: true, message: 'Ulasan berhasil dihapus!' });

    } catch (error) {
        console.error("Error delete review:", error);
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan server saat menghapus ulasan.' });
    }
});

const PAYWUZ_API_KEY = process.env.PAYWUZ_API_KEY || "pk_live_f1429e9285d76999cc3f8bb6c3df552f";
const PAYWUZ_BASE_URL = "https://api.paywuz.id/v2";
const PAYWUZ_HEADERS = {
    "Authorization": `Bearer ${PAYWUZ_API_KEY}`,
    "Content-Type": "application/json"
};

async function axiosPaywuzWithRetry(config, maxRetries = 3, delayMs = 1500) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await axios({
                timeout: 15000,
                ...config
            });
        } catch (error) {
            const status = error.response?.status;
            const isLastAttempt = i === maxRetries - 1;

            const isNetworkOrTimeout = !error.response || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
            const isRetryableStatus = status === 429 || (status >= 500 && status < 600);
            const shouldRetry = isNetworkOrTimeout || isRetryableStatus;

            if (shouldRetry && !isLastAttempt) {
                const reason = status ? `HTTP ${status}` : (error.code || 'Network/Timeout Error');
                console.warn(`⚠️ Gateway gagal (${reason}). Retry ke-${i + 1} dalam ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                delayMs *= 2;
            } else {
                throw error;
            }
        }
    }
}

function isValidIndonesianPhone(phone) {
    if (!phone) return false;
    const cleaned = phone.toString().replace(/[\s\-()]/g, '');
    return /^(\+62|62|08)[0-9]{8,12}$/.test(cleaned);
}

app.post('/api/vouchers/claim', async (req, res) => {
    try {
        const code = req.body.code;
        if (!code) {
            return res.status(400).json({ status: false, message: 'Kode voucher wajib diisi!' });
        }

        const cleanCode = code.trim().toUpperCase();
        const userIdentifier = getUserIdentifier(req);

        const voucher = await VoucherV2.findOne({ code: cleanCode });

        if (!voucher) {
            return res.status(404).json({ status: false, message: 'Kode voucher tidak ditemukan!' });
        }

        if (voucher.usageLimit <= 0) {
            return res.status(400).json({ 
                status: false, 
                reason: 'limit_reached',
                message: 'Kuota penggunaan voucher ini sudah habis!' 
            });
        }

        if (voucher.usedBy && voucher.usedBy.includes(userIdentifier)) {
            return res.status(400).json({
                status: false,
                reason: 'already_used',
                message: 'Anda sudah pernah menggunakan voucher ini sebelumnya!'
            });
        }

        if (new Date() > new Date(voucher.expiredAt)) {
            return res.status(400).json({ 
                status: false, 
                reason: 'expired',
                message: 'Voucher telah kedaluwarsa!' 
            });
        }

        voucher.usedCount += 1;
        voucher.usageLimit = Math.max(0, voucher.usageLimit - 1); 

        if (!voucher.usedBy) voucher.usedBy = [];
        voucher.usedBy.push(userIdentifier);

        await voucher.save();

        return res.json({
            status: true,
            message: 'Voucher berhasil diklaim!',
            voucher: {
                code: voucher.code,
                discount: voucher.discount,
                type: voucher.type
            },
            data: {
                code: voucher.code,
                discount: voucher.discount,
                type: voucher.type
            }
        });
    } catch (err) {
        console.error("Error Claim Voucher:", err);
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan pada server.' });
    }
});

app.get('/api/vouchers/:code', async (req, res) => {
    try {
        const code = req.query.code || req.params.code;
        if (!code) {
            return res.status(400).json({ status: false, message: 'Kode voucher wajib diisi!' });
        }

        const userIdentifier = getUserIdentifier(req);
        const voucher = await VoucherV2.findOne({ code: code.trim().toUpperCase() });
        if (!voucher) {
            return res.status(404).json({ status: false, message: 'Kode voucher tidak ditemukan!' });
        }

        if (voucher.usageLimit <= 0) {
            return res.status(400).json({ 
                status: false, 
                reason: 'limit_reached',
                message: 'Kuota penggunaan voucher ini sudah habis!' 
            });
        }

        if (voucher.usedBy && voucher.usedBy.includes(userIdentifier)) {
            return res.status(400).json({
                status: false,
                reason: 'already_used',
                message: 'Anda sudah pernah menggunakan voucher ini sebelumnya!'
            });
        }

        if (new Date() > new Date(voucher.expiredAt)) {
            return res.status(400).json({ 
                status: false, 
                reason: 'expired',
                message: 'Voucher telah kedaluwarsa!' 
            });
        }

        return res.json({
            status: true,
            message: 'Voucher berhasil ditemukan!',
            data: {
                code: voucher.code,
                discount: voucher.discount,
                type: voucher.type
            }
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan pada server.' });
    }
});

async function recordProductBuyer(productQuery, userIdentifier) {
    if (!productQuery || !userIdentifier) return;
    try {
        const cleanIdentifier = userIdentifier.toString().toLowerCase().trim();
        await ProductV2.findOneAndUpdate(
            { 
                $or: [
                    { Id: productQuery },
                    { _id: mongoose.Types.ObjectId.isValid(productQuery) ? productQuery : null },
                    { nama: { $regex: new RegExp(`^${productQuery.toString().trim()}$`, 'i') } }
                ]
            },
            { $addToSet: { purchasedBy: cleanIdentifier } }
        );
    } catch (err) {
        console.error("❌ Gagal mencatat pembeli produk:", err.message);
    }
}

async function updateProductStockAndSold(productName, qtyChange = 1, isRollback = false) {
    try {
        if (!productName) return null;

        const product = await ProductV2.findOne({ 
            nama: { $regex: new RegExp(`^${productName.trim()}$`, 'i') } 
        });

        if (product) {
            if (isRollback) {
                product.stok = (product.stok || 0) + qtyChange;
                product.terjual = Math.max(0, (product.terjual || 0) - qtyChange);
            } else {
                product.stok = Math.max(0, (product.stok || 0) - qtyChange);
                product.terjual = (product.terjual || 0) + qtyChange;
            }

            await product.save();
            return product;
        }
    } catch (err) {
        console.error("❌ Gagal meng-update stok produk:", err.message);
    }
    return null;
}

async function setCache(key, data) {
    try {
        await CacheV2.findOneAndUpdate(
            { key },
            { data, createdAt: new Date() },
            { upsert: true, new: true }
        );
    } catch (e) {
        console.error("Gagal simpan cache Database:", e.message);
    }
}

async function getCache(key) {
    try {
        const cached = await CacheV2.findOne({ key });
        return cached ? cached.data : null;
    } catch (e) {
        return null;
    }
}

async function deleteCache(key) {
    try {
        await CacheV2.deleteOne({ key });
    } catch (e) {}
}

function verifyPaywuzSignature(rawBody, receivedSignature, apikey) {
    if (!receivedSignature || !rawBody) return false;

    const computedSignature = "sha256=" + crypto
        .createHmac("sha256", apikey)
        .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
        .digest("hex");

    try {
        return crypto.timingSafeEqual(
            Buffer.from(receivedSignature),
            Buffer.from(computedSignature)
        );
    } catch (err) {
        return false;
    }
}

// DEPOSIT & SALDO
app.post('/api/deposit', checkAuthSession, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu untuk deposit.' });
        }

        const amount = Number(req.body.amount);
        const customerPhone = (req.body.customerPhone || '').toString().replace(/[\s\-()]/g, '').trim();

        if (isNaN(amount) || amount < 1000) {
            return res.status(400).json({ status: false, message: 'Deposit minimal adalah Rp 1.000!' });
        }

        if (!isValidIndonesianPhone(customerPhone)) {
            return res.status(400).json({ 
                status: false, 
                message: 'Nomor HP Indonesia aktif wajib diisi dengan format 08xx, 62xx, atau +62!' 
            });
        }

        const activeUser = await UserV2.findById(req.user.id || req.user._id).lean();
        const customerName = (activeUser?.username || req.user.name || req.user.username || 'Pelanggan').trim();
        const customerEmail = (activeUser?.email || req.user.email).toLowerCase().trim();

        const orderId = `TRX-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Request ke Endpoint Paywuz v2 /transactions/qris
        const paywuzRes = await axiosPaywuzWithRetry({
            method: 'post',
            url: `${PAYWUZ_BASE_URL}/transactions/qris`,
            data: {
                orderId,
                amount: amount,
                feeByMerchant: false,
                customer: {
                    name: customerName,
                    phone: customerPhone,
                    email: customerEmail
                }
            },
            headers: PAYWUZ_HEADERS
        });

        const transactionData = paywuzRes.data?.data || paywuzRes.data;
        const qrisString = transactionData?.payment?.qrString || 
                           transactionData?.qrString || 
                           transactionData?.payment?.qrUrl ||
                           transactionData?.paymentNumber;

        if (!qrisString) {
            throw new Error("Gateway tidak mengembalikan payment.qrString yang valid.");
        }

        const safeNum = (val) => {
            const num = Number(val);
            return (!isNaN(num) && num > 0) ? num : null;
        };

        const feeFlatIdr = Number(transactionData.feeFlatIdr) || 290;
        const feePercentBps = Number(transactionData.feePercentBps) || 70;
        const calculatedFee = feeFlatIdr + Math.ceil((amount * feePercentBps) / 10000);

        let finalAmount = safeNum(transactionData.grossAmount) || 
                          safeNum(transactionData.totalAmount) || 
                          safeNum(transactionData.total);

        if (!finalAmount) {
            const feeVal = safeNum(transactionData.fee) || safeNum(transactionData.feeAdmin) || calculatedFee;
            finalAmount = amount + feeVal;
        }

        const expiredAt = transactionData.expiredAt 
            ? new Date(transactionData.expiredAt) 
            : new Date(Date.now() + 15 * 60 * 1000);

        const newTrx = new TransactionV2({
            orderId,
            amount: finalAmount,
            paymentNumber: qrisString,
            paymentMethod: "QRIS",
            type: "DEPOSIT",
            userEmail: customerEmail,
            status: (transactionData.status || "pending").toLowerCase(),
            itemDetails: {
                nama: `Deposit Saldo Rp ${amount.toLocaleString('id-ID')}`,
                harga: amount,
                buyer: customerEmail
            },
            expiredAt: expiredAt
        });

        await newTrx.save();

        return res.json({
            status: true,
            data: {
                ...newTrx.toObject(),
                payment: {
                    qrString: qrisString
                }
            }
        });

    } catch (error) {
        console.error("Error Create Deposit TRX v2:", error.response?.data || error.message);
        return res.status(500).json({
            status: false,
            message: error.response?.data?.message || error.message || "Gagal membuat invoice deposit QRIS v2"
        });
    }
});

app.post('/api/store/pay-with-balance', checkAuthSession, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ status: false, message: "Silakan login terlebih dahulu untuk bertransaksi." });
        }

        const { productId, qty, voucherCode } = req.body;
        const buyQty = Number(qty) || 1;

        if (!productId) {
            return res.status(400).json({ status: false, message: "Product ID wajib diisi!" });
        }

        const dbProduct = await ProductV2.findOne({
            $or: [{ Id: productId }, { _id: mongoose.Types.ObjectId.isValid(productId) ? productId : null }]
        });

        if (!dbProduct) {
            return res.status(404).json({ status: false, message: "Produk tidak ditemukan di database." });
        }

        if (dbProduct.stok < buyQty) {
            return res.status(400).json({ status: false, message: "Stok produk tidak mencukupi!" });
        }

        const unitPrice = dbProduct.harga_diskon || dbProduct.harga;
        let totalPrice = unitPrice * buyQty;

        let discountAmount = 0;
        if (voucherCode && voucherCode.trim()) {
            const v = await VoucherV2.findOne({ code: voucherCode.trim().toUpperCase() });
            if (v && v.usageLimit > 0 && new Date() <= new Date(v.expiredAt)) {
                if (v.type === 'percentage') {
                    discountAmount = Math.floor((totalPrice * v.discount) / 100);
                } else if (v.type === 'fixed') {
                    discountAmount = v.discount;
                }
            }
        }

        const finalPrice = Math.max(0, totalPrice - discountAmount);

        const user = await UserV2.findById(req.user.id || req.user._id);
        if (!user) {
            return res.status(404).json({ status: false, message: "Data akun tidak ditemukan." });
        }

        const currentBalance = user.saldo || 0;

        if (currentBalance < finalPrice) {
            return res.status(400).json({ 
                status: false, 
                insufficientBalance: true,
                message: "Saldo tidak tersedia, silahkan deposit!" 
            });
        }

        user.saldo = currentBalance - finalPrice;
        await user.save();

        await updateProductStockAndSold(dbProduct.nama, buyQty, false);
        await recordProductBuyer(dbProduct.nama, user.email);

        const orderId = `TRX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        const newTransaction = new TransactionV2({
            orderId,
            amount: finalPrice,
            paymentMethod: "SALDO",
            status: "success",
            type: "PURCHASE",
            userEmail: user.email.toLowerCase().trim(),
            itemDetails: {
                nama: dbProduct.nama,
                harga: unitPrice,
                harga_setelah_voucher: finalPrice,
                kategori: dbProduct.kategori,
                gambar: Array.isArray(dbProduct.gambar) ? dbProduct.gambar[0] : dbProduct.gambar,
                link: dbProduct.link,
                buyer: user.email,
                qty: buyQty
            },
            productLink: dbProduct.link,
            expiredAt: new Date()
        });

        await newTransaction.save();

        return res.json({
            status: true,
            message: "Pembayaran berhasil menggunakan Saldo!",
            data: {
                orderId: orderId,
                amount: finalPrice,
                productLink: dbProduct.link,
                remainingBalance: user.saldo
            }
        });

    } catch (err) {
        console.error("Error Pay with balance:", err);
        return res.status(500).json({ status: false, message: "Terjadi kesalahan server saat memproses transaksi saldo." });
    }
});

app.get('/transactions/:orderId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        const { orderId } = req.params;
        const forceRefresh = req.query.refresh === '1';

        if (!forceRefresh) {
            const cachedData = await getCache(`trx_${orderId}`);
            if (cachedData) {
                return res.json({ data: cachedData });
            }
        }

        let localTrx = await TransactionV2.findOne({ orderId });

        if (!localTrx) {
            return res.status(404).json({ 
                error: "TRANSACTION_NOT_FOUND", 
                message: "Transaksi tidak ditemukan" 
            });
        }

        // Jika masih pending, cek ulang ke GET /v2/transactions/:orderId jika diperlukan
        if (localTrx.status.toLowerCase() === "pending") {
            if (new Date() > new Date(localTrx.expiredAt)) {
                localTrx.status = "cancelled";
                localTrx.updatedAt = new Date();
                await localTrx.save();
            } else {
                try {
                    const checkRes = await axiosPaywuzWithRetry({
                        method: 'get',
                        url: `${PAYWUZ_BASE_URL}/transactions/${orderId}`,
                        headers: PAYWUZ_HEADERS
                    });
                    const remoteData = checkRes.data?.data || checkRes.data;
                    const remoteStatus = remoteData?.status?.toLowerCase();

                    if (remoteStatus && remoteStatus !== localTrx.status.toLowerCase()) {
                        const prevStatus = localTrx.status.toLowerCase();
                        localTrx.status = remoteStatus;
                        localTrx.updatedAt = new Date();

                        if (["settlement", "success", "paid"].includes(remoteStatus) && !["settlement", "success", "paid"].includes(prevStatus)) {
                            if (localTrx.type === 'DEPOSIT' && localTrx.userEmail) {
                                const depositAmount = localTrx.itemDetails?.harga || localTrx.amount;
                                await UserV2.findOneAndUpdate(
                                    { email: localTrx.userEmail.toLowerCase().trim() },
                                    { $inc: { saldo: depositAmount } }
                                );
                            }
                        }
                        await localTrx.save();
                    }
                } catch (syncErr) {
                    // Abaikan error sementara saat polling remote, gunakan state DB lokal
                }
            }
        }

        const currentStatus = localTrx.status.toLowerCase();
        const isSuccess = ["settlement", "success", "paid", "settled"].includes(currentStatus);

        if (isSuccess && !localTrx.productLink && localTrx.itemDetails?.nama) {
            const dbProduct = await ProductV2.findOne({
                nama: { $regex: new RegExp(`^${localTrx.itemDetails.nama.trim()}$`, 'i') }
            }).lean();
            if (dbProduct && dbProduct.link) {
                localTrx.productLink = dbProduct.link;
                await localTrx.save();
            }
        }

        const responseData = {
            orderId: localTrx.orderId,
            status: currentStatus,
            amount: localTrx.amount,
            paymentNumber: localTrx.paymentNumber,
            payment: {
                qrString: localTrx.paymentNumber
            },
            expiredAt: localTrx.expiredAt,
            productLink: isSuccess ? localTrx.productLink : null,
            itemDetails: localTrx.itemDetails
        };

        await setCache(`trx_${orderId}`, responseData);

        res.json({ data: responseData });

    } catch (error) {
        console.error("Error Status TRX v2:", error.message);
        const localTrx = await TransactionV2.findOne({ orderId: req.params.orderId });
        if (localTrx) {
            return res.json({ data: localTrx });
        }
        res.status(500).json({ 
            error: "TRANSACTION_FETCH_FAILED", 
            message: "Gagal mengambil status transaksi" 
        });
    }
});

app.post('/transactions/:orderId/cancel', async (req, res) => {
    try {
        const { orderId } = req.params;
        const localTrx = await TransactionV2.findOne({ orderId });

        if (!localTrx) {
            return res.status(404).json({ status: false, message: "Transaksi tidak ditemukan" });
        }

        const prevStatus = localTrx.status.toLowerCase();

        try {
            await axiosPaywuzWithRetry({
                method: 'post',
                url: `${PAYWUZ_BASE_URL}/transactions/${orderId}/cancel`,
                headers: PAYWUZ_HEADERS
            });
        } catch (err) {
            console.warn(`Gateway v2 cancel notice for ${orderId}:`, err.response?.data || err.message);
        }

        if (["paid", "settlement", "success"].includes(prevStatus)) {
            if (localTrx.itemDetails && localTrx.itemDetails.nama && localTrx.type !== 'DEPOSIT') {
                const qtyPurchased = localTrx.itemDetails.qty || 1;
                await updateProductStockAndSold(localTrx.itemDetails.nama, qtyPurchased, true);
            }
        }

        localTrx.status = "cancelled";
        localTrx.updatedAt = new Date();
        await localTrx.save();

        await deleteCache(`trx_${orderId}`);

        return res.json({
            status: true,
            data: { orderId, status: "cancelled" }
        });

    } catch (error) {
        console.error("Error Cancel TRX v2:", error.message);
        res.status(500).json({
            error: "CANCEL_TRANSACTION_FAILED",
            message: error.message || "Gagal membatalkan transaksi"
        });
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-paywuz-signature'];
        const payloadToVerify = req.rawBody || JSON.stringify(req.body);

        const isValid = verifyPaywuzSignature(payloadToVerify, signature, PAYWUZ_API_KEY);

        // Respons 401 (4xx selain 429) -> Paywuz TIDAK akan mengirim ulang webhook tidak valid
        if (!isValid) {
            return res.status(401).json({ 
                error: "INVALID_SIGNATURE", 
                message: "Signature webhook X-Paywuz-Signature tidak valid!" 
            });
        }

        const payload = req.body;
        const eventName = payload?.event || payload?.type; 
        const payloadData = payload?.data || payload;
        const orderId = payloadData?.orderId;
        const status = payloadData?.status ? payloadData.status.toLowerCase() : null;

        // Respons 400 (4xx selain 429) -> Tidak perlu di-retry
        if (!orderId) {
            return res.status(400).json({ error: "MISSING_ORDER_ID", message: "orderId tidak ada!" });
        }

        let localTrx = await TransactionV2.findOne({ orderId });

        if (localTrx) {
            const prevStatus = localTrx.status.toLowerCase();
            if (status) {
                localTrx.status = status;
            } else if (eventName === "transaction.paid") {
                localTrx.status = "success";
            }
            localTrx.updatedAt = new Date();

            const isPaidEvent = eventName === "transaction.paid";
            const isCancelEvent = ["cancelled", "failed", "expired"].includes(localTrx.status);

            // Idempotency check: Cegah penambahan saldo/stok ganda jika Paywuz melakukan retry webhook
            if (isPaidEvent && !["paid", "settlement", "success"].includes(prevStatus)) {
                if (localTrx.type === 'DEPOSIT' && localTrx.userEmail) {
                    const depositAmount = localTrx.itemDetails?.harga || localTrx.amount;
                    await UserV2.findOneAndUpdate(
                        { email: localTrx.userEmail.toLowerCase().trim() },
                        { $inc: { saldo: depositAmount } }
                    );
                } else if (localTrx.itemDetails && localTrx.itemDetails.nama) {
                    const qtyPurchased = localTrx.itemDetails.qty || 1;
                    await updateProductStockAndSold(localTrx.itemDetails.nama, qtyPurchased, false);

                    const buyerIdentifier = localTrx.userEmail || localTrx.itemDetails?.buyer || localTrx.paymentNumber;
                    await recordProductBuyer(localTrx.itemDetails.nama, buyerIdentifier);
                }

                if (!localTrx.productLink && localTrx.itemDetails?.nama && localTrx.type !== 'DEPOSIT') {
                    const dbProduct = await ProductV2.findOne({ 
                        nama: { $regex: new RegExp(`^${localTrx.itemDetails.nama.trim()}$`, 'i') } 
                    }).lean();
                    if (dbProduct) localTrx.productLink = dbProduct.link;
                }
            } 
            else if (isCancelEvent && ["paid", "settlement", "success"].includes(prevStatus)) {
                if (localTrx.type !== 'DEPOSIT' && localTrx.itemDetails && localTrx.itemDetails.nama) {
                    const qtyPurchased = localTrx.itemDetails.qty || 1;
                    await updateProductStockAndSold(localTrx.itemDetails.nama, qtyPurchased, true);
                }
            }

            await localTrx.save();
            await deleteCache(`trx_${orderId}`);
        }

        // Balas 200 OK dalam < 15 detik agar Paywuz menghentikan retry
        return res.status(200).json({ status: true, message: "Webhook v2 diproses", orderId });

    } catch (err) {
        console.error("Webhook v2 Error:", err);
        // Respons 500 (5xx) -> Memicu Paywuz mengirim ulang webhook (30s -> 60s)
        return res.status(500).json({ error: "WEBHOOK_PROCESSING_ERROR", message: "Error internal webhook" });
    }
});

app.post('/api/store/manual-order', checkAuthSession, async (req, res) => {
    try {
        const productName = req.body.productName;
        const qty = req.body.qty;
        const buyQty = Number(qty) || 1;

        if (!productName) {
            return res.status(400).json({ status: false, message: "Nama produk wajib diisi!" });
        }

        const updatedProduct = await updateProductStockAndSold(productName, buyQty);

        if (!updatedProduct) {
            return res.status(404).json({ status: false, message: "Produk tidak ditemukan di database." });
        }

        const buyer = req.user ? req.user.email : (req.body.username || getUserIdentifier(req));
        await recordProductBuyer(updatedProduct.Id || updatedProduct._id, buyer);

        return res.json({
            status: true,
            message: "Stok dan jumlah terjual berhasil diperbarui secara otomatis!",
            data: updatedProduct
        });
    } catch (err) {
        console.error("Manual Order Error:", err);
        return res.status(500).json({ status: false, message: "Terjadi kesalahan server." });
    }
});

app.get('/api/user/transactions', checkAuthSession, async (req, res) => {
    try {
        let transactions = [];
        const orderIds = req.query.orderIds ? req.query.orderIds.split(',').filter(Boolean) : [];

        if (req.user && req.user.email) {
            const uIdent = req.user.email.toLowerCase().trim();
            transactions = await TransactionV2.find({
                $or: [
                    { userEmail: uIdent },
                    { "itemDetails.buyer": uIdent },
                    { orderId: { $in: orderIds } }
                ]
            }).sort({ createdAt: -1 }).lean();
        } else if (orderIds.length > 0) {
            transactions = await TransactionV2.find({
                orderId: { $in: orderIds }
            }).sort({ createdAt: -1 }).lean();
        } else {
            transactions = [];
        }

        return res.json({ status: true, transactions: transactions });
    } catch (err) {
        console.error("Error fetching transaction history:", err);
        return res.status(500).json({ status: false, message: "Gagal mengambil riwayat transaksi" });
    }
});

// AUTHENTICATION HANDLERS
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await UserV2.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new LocalStrategy({ usernameField: 'username', passwordField: 'password' }, 
    async (usernameOrEmail, password, done) => {
        try {
            const user = await UserV2.findOne({
                $or: [
                    { username: usernameOrEmail }, 
                    { email: usernameOrEmail.toLowerCase() }
                ]
            });

            if (!user) return done(null, false, { message: 'Username atau Email tidak ditemukan.' });

            if (!user.password || user.provider !== 'local') {
                return done(null, false, { 
                    message: `Akun ini terdaftar via ${user.provider.toUpperCase()}. Silakan masuk dengan tombol ${user.provider.toUpperCase()}.` 
                });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return done(null, false, { message: 'Kata sandi salah.' });

            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }
));

function sendSweetAlert(res, icon, title, text, redirectUrl) {
    return res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Notification</title>
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    background-color: #0b0f19;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }
                .swal2-popup {
                    background: #111827 !important;
                    border: 1px solid rgba(255, 255, 255, 0.08) !important;
                    border-radius: 16px !important;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
                }
                .swal2-title {
                    color: #ffffff !important;
                    font-weight: 700 !important;
                }
                .swal2-html-container {
                    color: #9ca3af !important;
                }
                .swal2-confirm {
                    background: linear-gradient(to right, #0891b2, #06b6d4) !important;
                    color: #0f172a !important;
                    font-weight: 700 !important;
                    border-radius: 12px !important;
                    padding: 10px 24px !important;
                }
            </style>
        </head>
        <body>
            <script>
                Swal.fire({
                    icon: '${icon}',
                    title: '${title}',
                    text: '${text}',
                    confirmButtonText: 'OKE',
                    scrollbarPadding: false
                }).then(() => {
                    window.location = '${redirectUrl}';
                });
            </script>
        </body>
        </html>
    `);
}

// ====================================================
// FITUR API OTP KODE 6 DIGIT & PEMBATASAN MAKSIMAL 5x SEHARI
// ====================================================

// 1. ENDPOINT MINTA KODE OTP
app.post('/auth/send-otp', async (req, res) => {
    try {
        const { email, type } = req.body;
        if (!email || !type) {
            return res.status(400).json({ status: false, message: 'Email/Username dan jenis aksi wajib diisi!' });
        }

        const inputClean = email.toLowerCase().trim();
        let targetEmail = inputClean;

        if (type === 'login' || type === 'forgot') {
            const user = await UserV2.findOne({
                $or: [{ email: inputClean }, { username: inputClean }]
            });
            if (!user) {
                return res.status(404).json({ status: false, message: 'Username atau Email tidak terdaftar di sistem kami!' });
            }
            if (user.provider !== 'local') {
                return res.status(400).json({ status: false, message: `Akun mendaftar via ${user.provider.toUpperCase()}, tidak membutuhkan OTP.` });
            }
            targetEmail = user.email;
        } else if (type === 'register') {
            const existingUser = await UserV2.findOne({ email: inputClean });
            if (existingUser) {
                return res.status(400).json({ status: false, message: 'Email sudah terdaftar!' });
            }
        }

        // Cek Kuota Pengiriman Harian (Maksimal 5x)
        const canSend = await checkAndIncrementEmailLimit(targetEmail);
        if (!canSend) {
            return res.status(429).json({ status: false, message: 'Batas harian pengiriman email OTP tercapai (Maksimal 5 kali sehari).' });
        }

        // Buat Kode OTP 6 Digit
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Expire 10 Menit

        await VerificationCode.deleteMany({ email: targetEmail, type });

        const newVerification = new VerificationCode({
            email: targetEmail,
            code: otpCode,
            type,
            expiresAt
        });
        await newVerification.save();

        const typeNames = { login: 'Login Akun', register: 'Pendaftaran Akun', forgot: 'Reset Kata Sandi' };
        await sendEmailOTP(targetEmail, otpCode, typeNames[type] || 'Verifikasi');

        return res.json({ status: true, message: `Kode verifikasi 6 digit berhasil dikirim ke ${targetEmail}.` });

    } catch (err) {
        console.error("Gagal kirim OTP:", err);
        return res.status(500).json({ status: false, message: 'Gagal mengirim kode verifikasi ke email.' });
    }
});

// 2. ENDPOINT VERIFIKASI OTP
app.post('/auth/verify-otp', async (req, res) => {
    try {
        const { email, code, type } = req.body;
        if (!email || !code || !type) {
            return res.status(400).json({ status: false, message: 'Email, kode OTP, dan jenis aksi wajib diisi!' });
        }

        const inputClean = email.toLowerCase().trim();
        const cleanCode = code.toString().trim();
        let targetEmail = inputClean;

        if (type === 'login' || type === 'forgot') {
            const user = await UserV2.findOne({
                $or: [{ email: inputClean }, { username: inputClean }]
            });
            if (user) targetEmail = user.email;
        }

        const record = await VerificationCode.findOne({
            email: targetEmail,
            code: cleanCode,
            type,
            expiresAt: { $gt: new Date() }
        });

        if (!record) {
            return res.status(400).json({ status: false, message: 'Kode OTP tidak valid atau sudah kedaluwarsa!' });
        }

        await VerificationCode.deleteOne({ _id: record._id });

        return res.json({ status: true, message: 'Verifikasi kode berhasil!' });

    } catch (err) {
        return res.status(500).json({ status: false, message: 'Gagal memproses verifikasi OTP.' });
    }
});

// 3. ENDPOINT RESET PASSWORD VIA OTP
app.post('/auth/reset-password-otp', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ status: false, message: 'Email, Kode OTP, dan Kata Sandi Baru wajib diisi!' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ status: false, message: 'Kata sandi baru minimal 8 karakter!' });
        }

        const cleanEmail = email.toLowerCase().trim();
        const cleanCode = code.toString().trim();

        const record = await VerificationCode.findOne({
            email: cleanEmail,
            code: cleanCode,
            type: 'forgot',
            expiresAt: { $gt: new Date() }
        });

        if (!record) {
            return res.status(400).json({ status: false, message: 'Kode OTP tidak valid atau sudah kedaluwarsa!' });
        }

        const user = await UserV2.findOne({ email: cleanEmail });
        if (!user) {
            return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        await VerificationCode.deleteOne({ _id: record._id });

        return res.json({ status: true, message: 'Kata sandi berhasil diperbarui! Silakan masuk kembali.' });

    } catch (err) {
        console.error("Reset Password OTP Error:", err);
        return res.status(500).json({ status: false, message: 'Gagal mengatur ulang kata sandi.' });
    }
});

// LOGIN ROUTE
app.post('/auth/login', (req, res, next) => {
    passport.authenticate('local', async (err, user, info) => { 
        if (err) return next(err);

        if (!user) {
            const pesanGagal = info && info.message ? info.message : 'Username atau password salah.';
            return sendSweetAlert(res, 'error', 'Gagal Masuk', pesanGagal, '/login');
        }

        req.logIn(user, async (err) => { 
            if (err) return next(err);

            try {
                const userPayload = {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    name: user.username,
                    avatar: user.avatar || 'https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png',
                    createdAt: user.createdAt
                };

                const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

                res.cookie('auth_session', token, {
                    maxAge: 7 * 24 * 60 * 60 * 1000, 
                    httpOnly: true,
                    secure: true, 
                    sameSite: 'lax'
                });

                return res.redirect('/dashboard');

            } catch (error) {
                console.error("Gagal sinkronisasi data saat login:", error);
                return next(error);
            }
        });
    })(req, res, next);
});

// REGISTER ROUTE
app.post('/auth/register', async (req, res) => {
    try {
        const { username, email, password, referralCode } = req.body;

        if (!username || !email || !password) {
            return sendSweetAlert(res, 'error', 'Pendaftaran Gagal', 'Semua data wajib diisi!', '/login');
        }

        const cleanUsername = username.trim();
        const cleanEmail = email.toLowerCase().trim();

        const existingUser = await UserV2.findOne({ 
            $or: [{ username: cleanUsername }, { email: cleanEmail }] 
        });

        if (existingUser) {
            return sendSweetAlert(res, 'warning', 'Sudah Terdaftar', 'Username atau Email sudah terdaftar!', '/login');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const defaultAvatar = 'https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png';
        const myReferralCode = generateReferralCode();

        let initialSaldo = 0;
        let inviterUser = null;

        const codeToUse = referralCode || req.cookies?.pending_ref;

        if (codeToUse && codeToUse.trim()) {
            inviterUser = await UserV2.findOne({ referralCode: codeToUse.trim().toUpperCase() });
            if (inviterUser) {
                initialSaldo = 500;
                inviterUser.saldo = (inviterUser.saldo || 0) + 1000;
                await inviterUser.save();
            }
        }

        res.clearCookie('pending_ref');

        const newUser = new UserV2({
            username: cleanUsername,
            email: cleanEmail,
            password: hashedPassword,
            provider: 'local',
            avatar: defaultAvatar,
            saldo: initialSaldo,
            referralCode: myReferralCode,
            referredBy: inviterUser ? inviterUser.referralCode : null,
            createdAt: new Date()
        });
        await newUser.save();

        const userPayload = {
            id: newUser._id,
            username: newUser.username,
            name: newUser.username,
            email: newUser.email,
            avatar: defaultAvatar,
            createdAt: newUser.createdAt
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('auth_session', token, {
            maxAge: 7 * 24 * 60 * 60 * 1000, 
            httpOnly: true,
            secure: true, 
            sameSite: 'lax'
        });

        req.logIn(newUser, (err) => {
            if (err) return res.redirect('/login');
            const alertMsg = inviterUser 
                ? 'Pendaftaran berhasil! Anda mendapatkan bonus saldo Rp 500 dari kode undangan.' 
                : 'Pendaftaran berhasil! Selamat datang.';
            return sendSweetAlert(res, 'success', 'Berhasil!', alertMsg, '/dashboard');
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Terjadi error internal saat pendaftaran.');
    }
});

// ENDPOINT SETEL / UBAH KATA SANDI USER
app.post('/api/user/change-password', checkAuthSession, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu!' });
        }

        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.user.id || req.user._id;

        const user = await UserV2.findById(userId);
        if (!user) {
            return res.status(404).json({ status: false, message: 'User tidak ditemukan.' });
        }

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ status: false, message: 'Kata sandi baru minimal 8 karakter!' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ status: false, message: 'Konfirmasi kata sandi tidak cocok!' });
        }

        if (user.password) {
            if (!currentPassword) {
                return res.status(400).json({ status: false, message: 'Kata sandi saat ini wajib diisi!' });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ status: false, message: 'Kata sandi saat ini salah!' });
            }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        return res.json({
            status: true,
            message: user.password ? 'Kata sandi berhasil diperbarui!' : 'Kata sandi lokal berhasil disetel!'
        });

    } catch (err) {
        console.error("Gagal ubah password:", err);
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan pada server saat mengubah kata sandi.' });
    }
});

const GITHUB_CLIENT_ID = 'Ov23li23q78AeREkbepJ';
const GITHUB_CLIENT_SECRET = 'd14fef7651a10f50524b7bdd0a50a199fa81065b';
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || "https://arulzxd.biz.id/auth/github/callback";

const d = "613783942158";
const e = "-63q31341ivgrlulq8";
const f = "ha0m4uqmnoa6kq0";
const cl = ".apps.";
const id = "googleusercontent.com";

const GOOGLE_CLIENT_ID = `${d}${e}${f}${cl}${id}`;
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "https://arulzxd.biz.id/auth/google/callback";

/* OAuth GitHub */
app.get('/auth/github', (req, res) => {
    const ref = req.query.ref ? encodeURIComponent(req.query.ref) : '';
    const state = ref ? JSON.stringify({ ref }) : '';
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${GITHUB_CALLBACK_URL}&scope=user:email${state ? '&state=' + encodeURIComponent(state) : ''}`;
    res.redirect(url);
});

app.get('/auth/github/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.send('Authentication failed: No code provided');

    let refCodeFromState = req.cookies?.pending_ref || null;
    if (state) {
        try {
            const parsedState = JSON.parse(decodeURIComponent(state));
            if (parsedState.ref) refCodeFromState = parsedState.ref;
        } catch (e) {}
    }

    try {
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code: code
        }, { headers: { accept: 'application/json' } });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) return res.send('Authentication failed: Invalid access token');

        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `token ${accessToken}` }
        });

        const userData = userResponse.data;
        let userEmail = userData.email;

        if (!userEmail) {
            try {
                const emailsResponse = await axios.get('https://api.github.com/user/emails', {
                    headers: { Authorization: `token ${accessToken}` }
                });
                const primaryEmailObj = emailsResponse.data.find(e => e.primary && e.verified) || emailsResponse.data[0];
                if (primaryEmailObj) {
                    userEmail = primaryEmailObj.email;
                }
            } catch (emailErr) {
                console.error('Gagal mengambil private email:', emailErr.message);
            }
        }

        const finalEmail = (userEmail || `${userData.login}@github.com`).toLowerCase().trim();
        const currentUsername = (userData.login || finalEmail.split('@')[0]).toLowerCase().trim();

        let dbUser = await UserV2.findOne({ email: finalEmail });

        if (!dbUser) {
            let initialSaldo = 0;
            let inviterUser = null;

            if (refCodeFromState) {
                inviterUser = await UserV2.findOne({ referralCode: refCodeFromState.trim().toUpperCase() });
                if (inviterUser) {
                    initialSaldo = 500;
                    inviterUser.saldo = (inviterUser.saldo || 0) + 1000;
                    await inviterUser.save();
                }
            }

            dbUser = new UserV2({
                username: currentUsername,
                email: finalEmail,
                provider: 'github',
                providerId: String(userData.id),
                avatar: userData.avatar_url || 'https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png',
                saldo: initialSaldo,
                referralCode: generateReferralCode(),
                referredBy: inviterUser ? inviterUser.referralCode : null,
                createdAt: new Date()
            });

            await dbUser.save();
        } else {
            if (userData.avatar_url && dbUser.avatar !== userData.avatar_url) {
                dbUser.avatar = userData.avatar_url;
                await dbUser.save();
            }
        }

        res.clearCookie('pending_ref');

        const userPayload = {
            id: dbUser._id,
            username: dbUser.username,
            email: dbUser.email,
            name: userData.name || dbUser.username,
            avatar: dbUser.avatar,
            createdAt: dbUser.createdAt
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('auth_session', token, {
            maxAge: 7 * 24 * 60 * 60 * 1000, 
            httpOnly: true,
            secure: true, 
            sameSite: 'lax'
        });

        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        res.send('Login Error: ' + error.message);
    }
});

/* OAuth Google */
app.get('/auth/google', (req, res) => {
    const ref = req.query.ref ? encodeURIComponent(req.query.ref) : '';
    const state = ref ? JSON.stringify({ ref }) : '';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${GOOGLE_CALLBACK_URL}&response_type=code&scope=profile email${state ? '&state=' + encodeURIComponent(state) : ''}`;
    res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.send('Authentication failed: No code provided');

    let refCodeFromState = req.cookies?.pending_ref || null;
    if (state) {
        try {
            const parsedState = JSON.parse(decodeURIComponent(state));
            if (parsedState.ref) refCodeFromState = parsedState.ref;
        } catch (e) {}
    }

    try {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: GOOGLE_CALLBACK_URL
        });

        const tokenResponse = await axios.post(
            'https://oauth2.googleapis.com/token',
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;
        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const userData = userResponse.data;
        const email = userData.email.toLowerCase().trim();
        const currentUsername = (userData.login || email.split('@')[0]).toLowerCase().trim();

        let dbUser = await UserV2.findOne({ email: email });

        if (!dbUser) {
            let initialSaldo = 0;
            let inviterUser = null;

            if (refCodeFromState) {
                inviterUser = await UserV2.findOne({ referralCode: refCodeFromState.trim().toUpperCase() });
                if (inviterUser) {
                    initialSaldo = 500;
                    inviterUser.saldo = (inviterUser.saldo || 0) + 1000;
                    await inviterUser.save();
                }
            }

            dbUser = new UserV2({
                username: currentUsername,
                email: email,
                provider: 'google',
                providerId: String(userData.id),
                avatar: userData.picture || 'https://arulz-xd.my.id/files/Z9zjj0RF7G7ena.png',
                saldo: initialSaldo,
                referralCode: generateReferralCode(),
                referredBy: inviterUser ? inviterUser.referralCode : null,
                createdAt: new Date()
            });

            await dbUser.save();
        } else {
            if (userData.picture && dbUser.avatar !== userData.picture) {
                dbUser.avatar = userData.picture;
                await dbUser.save();
            }
        }

        res.clearCookie('pending_ref');

        const userPayload = {
            id: dbUser._id,
            username: dbUser.username,
            email: dbUser.email,
            name: userData.name || dbUser.username,
            avatar: dbUser.avatar,
            createdAt: dbUser.createdAt
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('auth_session', token, {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: true,
            sameSite: 'lax'
        });

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Google Auth Callback Error:', error.response?.data || error.message);
        res.send('Login Error: ' + (error.response?.data?.error_description || error.message));
    }
});

app.get('/login', (req, res) => {
    if (req.user) {
        return res.redirect('/profile'); 
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// NAVIGASI UTAMA
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/riwayat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'riwayat.html')));
app.get('/store', (req, res) => res.sendFile(path.join(__dirname, 'public', 'store.html')));
app.get('/deposit', checkAuthSession, (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'deposit.html'));
});
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/profile', checkAuthSession, (req, res) => {
    if (!req.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});
app.get('/sitemap.xml', async (req, res) => {
    res.header('Content-Type', 'application/xml; charset=utf-8');
    try {
        const products = await ProductV2.find({}).select('Id updatedAt createdAt').lean();
        const productUrls = products.map(p => {
            const lastMod = new Date(p.updatedAt || p.createdAt || Date.now()).toISOString().split('T')[0];
            return `
  <url>
    <loc>https://arulzxd.biz.id/store/${encodeURIComponent(p.Id)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
        }).join('');

        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://arulzxd.biz.id/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://arulzxd.biz.id/store</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://arulzxd.biz.id/login</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://arulzxd.biz.id/riwayat</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://arulzxd.biz.id/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>${productUrls}
</urlset>`;
        res.send(xmlContent);
    } catch (e) {
        console.error('Error generate sitemap:', e);
        res.status(500).send('');
    }
});

app.get('/rss.xml', async (req, res) => {
    res.header('Content-Type', 'application/rss+xml; charset=utf-8');
    try {
        const escapeXml = (str) => String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const products = await ProductV2.find({}).sort({ createdAt: -1 }).limit(30).lean();
        const itemsXml = products.map(p => {
            const pubDate = new Date(p.createdAt || Date.now()).toUTCString();
            const link = `https://arulzxd.biz.id/store/${encodeURIComponent(p.Id)}`;
            const desc = p.deskripsi || `Beli ${p.nama} di ArulzXD Store dengan pengiriman otomatis 24/7.`;
            return `
    <item>
      <title>${escapeXml(p.nama)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(desc)}</description>
      <category>${escapeXml(p.kategori || 'Produk Digital')}</category>
    </item>`;
        }).join('');

        const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ArulzXD Store - Marketplace</title>
    <link>https://arulzxd.biz.id/store</link>
    <description>Marketplace penyedia Source Code, Script, dan Layanan Digital Premium otomatis 24/7.</description>
    <language>id</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://arulzxd.biz.id/rss.xml" rel="self" type="application/rss+xml" />${itemsXml}
  </channel>
</rss>`;
        res.send(rssContent);
    } catch (e) {
        console.error('Error generate RSS:', e);
        res.status(500).send('');
    }
});

app.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

function drawNeoBox(ctx, x, y, w, h, radius, fillColor, shadowOffset = 6, borderWidth = 4) {
    ctx.save();
    // Hard Shadow Hitam
    if (shadowOffset > 0) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.roundRect(x + shadowOffset, y + shadowOffset, w, h, radius);
        ctx.fill();
    }
    // Box Utama
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();

    // Border Hitam Tebal
    if (borderWidth > 0) {
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
    }
    ctx.restore();
}

// Helper memotong teks panjang agar tidak keluar batas
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(' ');
    let line = '';
    let lineCount = 0;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            lineCount++;
            if (lineCount >= maxLines) {
                ctx.fillText(line.trim() + '...', x, y);
                return;
            }
            ctx.fillText(line.trim(), x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, y);
}

// ENDPOINT GENERATOR OPEN GRAPH CANVAS (1200 x 630)
app.get('/api/og/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const product = await ProductV2.findOne({
            $or: [
                { Id: productId },
                { _id: mongoose.Types.ObjectId.isValid(productId) ? productId : null }
            ]
        }).lean();

        const width = 1200;
        const height = 630;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. BACKGROUND CYAN & AKSEN KUNING NEO-BRUTALISM
        ctx.fillStyle = '#00E5FF';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#FFDE59';
        ctx.beginPath();
        ctx.moveTo(820, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, 350);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, 420);
        ctx.lineTo(360, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 2. PANEL KIRI UTAMA
        drawNeoBox(ctx, 35, 35, 620, 560, 28, '#F4F0EA', 8, 5);

        // Pill URL di Kiri Atas
        drawNeoBox(ctx, 65, 65, 340, 44, 22, '#FFFFFF', 4, 3);
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(92, 87, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('->', 84, 92);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`https://arulzxd.biz.id/store/${product ? (product.Id || productId) : ''}`.slice(0, 34), 115, 93);

        // Judul Produk
        const namaProduk = product ? product.nama : 'ArulzXD Store';
        ctx.fillStyle = '#000000';
        ctx.font = '900 50px sans-serif';
        wrapText(ctx, namaProduk, 68, 175, 550, 58, 2);

        // Badge Harga & Kategori
        const hargaFinal = product ? (product.harga_diskon || product.harga) : 0;
        const hargaText = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(hargaFinal);

        drawNeoBox(ctx, 68, 265, 230, 46, 10, '#000000', 0, 0);
        ctx.fillStyle = '#FFDE59';
        ctx.font = '900 22px sans-serif';
        ctx.fillText(hargaText, 85, 296);

        const kategoriText = (product?.kategori || 'DIGITAL PRODUCT').toUpperCase();
        drawNeoBox(ctx, 315, 265, 240, 46, 10, '#FFDE59', 4, 3);
        ctx.fillStyle = '#000000';
        ctx.font = '900 18px sans-serif';
        ctx.fillText(kategoriText.slice(0, 18), 332, 295);

        // Deskripsi Produk
        ctx.fillStyle = '#222222';
        ctx.font = '600 21px sans-serif';
        const descText = product?.deskripsi || 'Penyedia Source Code, Script, & Layanan Digital Premium Terpercaya dengan Akses Otomatis.';
        wrapText(ctx, descText, 68, 355, 540, 30, 3);

        // Tombol CTA
        drawNeoBox(ctx, 68, 475, 260, 56, 28, '#000000', 5, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 21px sans-serif';
        ctx.fillText('Beli Sekarang', 95, 510);

        drawNeoBox(ctx, 275, 483, 44, 40, 10, '#FFDE59', 0, 2);
        ctx.fillStyle = '#000000';
        ctx.font = '900 18px sans-serif';
        ctx.fillText('>>', 284, 509);

        // Info Stok & Terjual
        drawNeoBox(ctx, 360, 480, 230, 48, 12, '#FFFFFF', 4, 3);
        ctx.fillStyle = '#00E676';
        ctx.beginPath();
        ctx.arc(385, 504, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = '800 15px sans-serif';
        ctx.fillText(`Stok: ${product?.stok ?? 99} | Terjual ${product?.terjual ?? 0}`, 402, 510);

        // 3. AMBIL MAKSIMAL 3 GAMBAR PRODUK DENGAN TIMEOUT AXIOS (AGAR TIDAK HANG)
        let rawImages = [];
        if (product && Array.isArray(product.gambar) && product.gambar.length > 0) {
            rawImages = product.gambar.slice(0, 3);
        } else if (product && typeof product.gambar === 'string' && product.gambar.trim() !== '') {
            rawImages = [product.gambar];
        } else {
            rawImages = ['https://cdn.larasxd.my.id/files/Z9zjj0RF7G7ena.png'];
        }

        const loadedImages = await Promise.all(
            rawImages.map(async (src) => {
                try {
                    if (src.startsWith('data:image/')) {
                        const base64Data = src.split(',')[1];
                        return await loadImage(Buffer.from(base64Data, 'base64'));
                    }
                    const imgRes = await axios.get(src, {
                        responseType: 'arraybuffer',
                        timeout: 4000, // Maksimal tunggu 4 detik per gambar
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    return await loadImage(Buffer.from(imgRes.data));
                } catch (e) {
                    console.warn('Gagal load gambar produk untuk OG:', src, e.message);
                    return null;
                }
            })
        );
        const validImages = loadedImages.filter(Boolean);

        // Header Mini Galeri di Kanan Atas
        ctx.save();
        ctx.translate(690, 45);
        ctx.rotate((3 * Math.PI) / 180);
        drawNeoBox(ctx, 0, 0, 470, 85, 18, '#FFFFFF', 6, 4);
        ctx.fillStyle = '#000000';
        ctx.font = '900 15px sans-serif';
        ctx.fillText('PREVIEW GALERI PRODUK (' + validImages.length + ' FOTO)', 22, 28);

        drawNeoBox(ctx, 20, 40, 140, 32, 10, '#FFDE59', 3, 2.5);
        ctx.font = '800 13px sans-serif';
        ctx.fillText('Preview Utama', 38, 61);

        if (validImages.length > 1) {
            drawNeoBox(ctx, 172, 40, 120, 32, 10, '#FFFFFF', 3, 2.5);
            ctx.fillText('Foto #2', 205, 61);
        }
        if (validImages.length > 2) {
            drawNeoBox(ctx, 304, 40, 120, 32, 10, '#00E5FF', 3, 2.5);
            ctx.fillText('Foto #3', 337, 61);
        }
        ctx.restore();

        // Render Kartu-Kartu Gambar Produk (1, 2, atau 3 gambar)
        const cardLayouts = {
            1: [{ x: 710, y: 165, w: 430, h: 410, angle: -2 }],
            2: [
                { x: 685, y: 175, w: 250, h: 380, angle: -4 },
                { x: 925, y: 160, w: 250, h: 380, angle: 4 }
            ],
            3: [
                { x: 675, y: 170, w: 235, h: 245, angle: -4 },
                { x: 925, y: 155, w: 235, h: 245, angle: 3 },
                { x: 785, y: 365, w: 265, h: 225, angle: -1.5 }
            ]
        };

        const count = Math.min(validImages.length, 3);
        if (count > 0) {
            const layouts = cardLayouts[count];
            layouts.forEach((layout, idx) => {
                const img = validImages[idx];
                if (!img) return;

                ctx.save();
                const centerX = layout.x + layout.w / 2;
                const centerY = layout.y + layout.h / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate((layout.angle * Math.PI) / 180);
                ctx.translate(-centerX, -centerY);

                drawNeoBox(ctx, layout.x, layout.y, layout.w, layout.h, 20, '#FFFFFF', 7, 4);

                const pad = 12;
                const footerH = 38;
                const imgBoxX = layout.x + pad;
                const imgBoxY = layout.y + pad;
                const imgBoxW = layout.w - pad * 2;
                const imgBoxH = layout.h - pad * 2 - footerH;

                ctx.save();
                ctx.beginPath();
                ctx.roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 12);
                ctx.clip();

                const scale = Math.max(imgBoxW / img.width, imgBoxH / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const drawX = imgBoxX + (imgBoxW - drawW) / 2;
                const drawY = imgBoxY + (imgBoxH - drawH) / 2;

                ctx.drawImage(img, drawX, drawY, drawW, drawH);
                ctx.restore();

                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#000000';
                ctx.beginPath();
                ctx.roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 12);
                ctx.stroke();

                const labelY = layout.y + layout.h - 16;
                ctx.fillStyle = '#000000';
                ctx.font = '900 14px sans-serif';
                ctx.fillText(`Gambar #${idx + 1}`, layout.x + 16, labelY);

                drawNeoBox(ctx, layout.x + layout.w - 86, layout.y + layout.h - 33, 72, 22, 8, '#FFDE59', 0, 2);
                ctx.fillStyle = '#000000';
                ctx.font = '900 11px sans-serif';
                ctx.fillText(`${idx + 1} / ${count}`, layout.x + layout.w - 64, layout.y + layout.h - 18);

                ctx.restore();
            });
        }

        // Convert ke JPEG berkualitas tinggi (lebih ringan dari PNG untuk WhatsApp < 300KB)
        const jpegBuffer = await canvas.encode('jpeg', 90);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Length', jpegBuffer.length);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(jpegBuffer);

    } catch (error) {
        console.error('Error generate OG Canvas:', error);
        return res.redirect('https://cdn.larasxd.my.id/files/t19j.jpg');
    }
});

app.get('/store/:productId', async (req, res) => {
    try {
        const { productId } = req.params;

        const product = await ProductV2.findOne({
            $or: [
                { Id: productId },
                { _id: mongoose.Types.ObjectId.isValid(productId) ? productId : null }
            ]
        }).lean();

        if (!product) {
            return res.sendFile(path.join(__dirname, 'public', 'store.html'));
        }

        // PAKSA HTTPS AGAR WHATSAPP MAU MERENDER PREVIEW
        const host = req.get('host');
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        const ogCanvasUrl = `${baseUrl}/api/og/product/${productId}`;
        const fullUrl = `${baseUrl}/store/${productId}`;

        const priceFormatted = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(product.harga_diskon || product.harga);

        const escapeMeta = (str) => String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const shareTitle = escapeMeta(`${product.nama} (${priceFormatted}) - ArulzXD Store`);
        const shareDesc = escapeMeta(
            product.deskripsi
                ? product.deskripsi.slice(0, 160)
                : 'Beli source code dan layanan digital berkualitas di ArulzXD Store.'
        );

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${shareTitle}</title>
    <meta name="description" content="${shareDesc}">

    <!-- Open Graph / WhatsApp / Facebook / Telegram -->
    <meta property="og:site_name" content="ArulzXD Store">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${fullUrl}">
    <meta property="og:title" content="${shareTitle}">
    <meta property="og:description" content="${shareDesc}">
    <meta property="og:image" content="${ogCanvasUrl}">
    <meta property="og:image:secure_url" content="${ogCanvasUrl}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${fullUrl}">
    <meta name="twitter:title" content="${shareTitle}">
    <meta name="twitter:description" content="${shareDesc}">
    <meta name="twitter:image" content="${ogCanvasUrl}">
</head>
<body style="background-color: #F4F0EA; color: #000000; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh;">
    <p>Mengarahkan ke produk...</p>
    <script>
        setTimeout(function() {
            window.location.replace("/store?shareId=${encodeURIComponent(productId)}");
        }, 150);
    </script>
</body>
</html>`);
    } catch (error) {
        console.error("Error Open Graph Share:", error);
        res.redirect('/store');
    }
});

app.get('/database/produk', async (req, res) => {
    try {
        const produk = await ProductV2.find({}).sort({ createdAt: -1 });
        res.json(produk);
    } catch (err) {
        console.error("Gagal mengambil data produk dari Database:", err);
        res.status(500).json({ error: "Gagal memuat data produk" });
    }
});

app.get('/auth/logout', (req, res, next) => {
    res.clearCookie('auth_session');
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/login');
    });
});

app.get('/api/user-status', async (req, res) => {
    if (req.user) {
        try {
            const activeUser = await UserV2.findById(req.user.id || req.user._id);

            if (!activeUser) return res.json({ loggedIn: false });

            if (!activeUser.referralCode) {
                activeUser.referralCode = generateReferralCode();
                await activeUser.save();
            }

            const uEmail = activeUser.email.toLowerCase().trim();

            const [deposits, purchases, invitedUsers] = await Promise.all([
                TransactionV2.aggregate([
                    { 
                        $match: { 
                            userEmail: uEmail, 
                            type: 'DEPOSIT', 
                            status: { $in: ['settlement', 'success', 'paid', 'settled'] } 
                        } 
                    },
                    { 
                        $group: { 
                            _id: null, 
                            total: { $sum: { $ifNull: ['$itemDetails.harga', '$amount'] } } 
                        } 
                    }
                ]),
                TransactionV2.aggregate([
                    { 
                        $match: { 
                            userEmail: uEmail, 
                            type: 'PURCHASE', 
                            status: { $in: ['settlement', 'success', 'paid', 'settled'] } 
                        } 
                    },
                    { 
                        $group: { 
                            _id: null, 
                            total: { $sum: '$amount' } 
                        } 
                    }
                ]),
                UserV2.find({ referredBy: activeUser.referralCode })
                    .select('username email createdAt')
                    .sort({ createdAt: -1 })
                    .lean()
            ]);

            const totalDeposit = deposits.length > 0 ? deposits[0].total : 0;
            const totalBelanja = purchases.length > 0 ? purchases[0].total : 0;

            res.json({
                loggedIn: true,
                user: {
                    id: activeUser._id,
                    name: activeUser.username,
                    username: activeUser.username,
                    email: activeUser.email,
                    avatar: activeUser.avatar,
                    banner: activeUser.banner || '',
                    saldo: activeUser.saldo || 0,
                    provider: activeUser.provider || 'local',
                    hasPassword: Boolean(activeUser.password),
                    referralCode: activeUser.referralCode,
                    totalDeposit: totalDeposit,
                    totalBelanja: totalBelanja,
                    invitedUsers: invitedUsers,
                    createdAt: activeUser.createdAt
                }
            });
        } catch (err) {
            res.json({ loggedIn: true, user: req.user });
        }
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const fourteenDaysAgo = new Date(startOfToday);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

        const [
            totalUsers, 
            totalProducts, 
            totalTrx, 
            lunasTrx, 
            trxToday, 
            trxYesterday, 
            recentTrxRaw,
            dailyChartRaw,
            latencyMetrics
        ] = await Promise.all([
            UserV2.countDocuments(),
            ProductV2.countDocuments(),
            TransactionV2.countDocuments(),
            TransactionV2.countDocuments({
                status: { $in: ['settlement', 'success', 'paid', 'settled'] }
            }),
            TransactionV2.countDocuments({ createdAt: { $gte: startOfToday } }),
            TransactionV2.countDocuments({
                createdAt: { $gte: startOfYesterday, $lt: startOfToday }
            }),
            TransactionV2.find({})
                .sort({ createdAt: -1 })
                .limit(10)
                .select('orderId userEmail amount status itemDetails createdAt type')
                .lean(),
            TransactionV2.aggregate([
                { $match: { createdAt: { $gte: fourteenDaysAgo } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%d %b", date: "$createdAt" } },
                        total: { $sum: 1 },
                        lunas: {
                            $sum: {
                                $cond: [{ $in: ["$status", ["settlement", "success", "paid", "settled"]] }, 1, 0]
                            }
                        },
                        batal: {
                            $sum: {
                                $cond: [{ $in: ["$status", ["cancelled", "failed", "expire", "batal"]] }, 1, 0]
                            }
                        }
                    }
                }
            ]),
            SystemMetricsV2.aggregate([
                { $match: { timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
                {
                    $group: {
                        _id: null,
                        avgLatency: { $avg: "$responseTimeMs" },
                        totalRequests: { $sum: 1 }
                    }
                }
            ])
        ]);

        const emails = recentTrxRaw.map(t => t.userEmail).filter(Boolean);
        const users = await UserV2.find({ email: { $in: emails } }).select('email username').lean();
        const userMap = {};
        users.forEach(u => {
            if (u.email) userMap[u.email.toLowerCase().trim()] = u.username;
        });

        const recentTrx = recentTrxRaw.map(trx => {
            const emailKey = (trx.userEmail || '').toLowerCase().trim();
            let cleanName = userMap[emailKey] || trx.itemDetails?.buyer || 'Guest';
            if (cleanName.includes('@')) cleanName = cleanName.split('@')[0];

            return {
                orderId: trx.orderId,
                pelanggan: cleanName,
                produk: trx.itemDetails?.nama || (trx.type === 'DEPOSIT' ? 'Deposit Saldo' : 'Pembelian Marketplace'),
                amount: trx.itemDetails?.harga_setelah_voucher || trx.amount || 0,
                status: trx.status,
                createdAt: trx.createdAt
            };
        });

        const chartLabels = [];
        const chartTotalTrx = [];
        const chartLunasTrx = [];
        const chartBatalTrx = [];

        for (let i = 13; i >= 0; i--) {
            const d = new Date(startOfToday);
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            
            const found = dailyChartRaw.find(item => item._id === dateStr);
            chartLabels.push(dateStr);
            chartTotalTrx.push(found ? found.total : 0);
            chartLunasTrx.push(found ? found.lunas : 0);
            chartBatalTrx.push(found ? found.batal : 0);
        }

        const systemLatency = latencyMetrics.length > 0 ? Math.round(latencyMetrics[0].avgLatency) : 12;
        const totalRequests = latencyMetrics.length > 0 ? latencyMetrics[0].totalRequests : totalTrx;

        res.json({
            status: true,
            totalUsers,
            totalProducts,
            totalTrx,
            lunasTrx,
            trxToday,
            trxYesterday,
            systemLatency: `${systemLatency} ms`,
            totalRequests,
            recentTrx,
            chartData: {
                labels: chartLabels,
                totalTrx: chartTotalTrx,
                lunasTrx: chartLunasTrx,
                batalTrx: chartBatalTrx
            }
        });
    } catch (err) {
        console.error("Gagal mengambil statistik dashboard:", err);
        res.status(500).json({ status: false, message: "Gagal memuat data statistik" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
