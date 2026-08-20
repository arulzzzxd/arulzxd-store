const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const { MongoStore } = require('connect-mongo');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const mime = require('mime-types');
const multer = require('multer');
const crypto = require('crypto');
const compression = require('compression');

const app = express();
app.use(compression());
app.set('etag', false);
const PORT = process.env.STORE_PORT || 3001;

app.use(express.static(path.join(__dirname)));
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', 1);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://arulz-xd-owner:Haqqi0213@cluster0.fgxhxqm.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('📦 [Store App] Berhasil terhubung ke MongoDB!'))
    .catch(err => console.error('❌ [Store App] Gagal koneksi ke MongoDB:', err));

const JWT_SECRET = process.env.JWT_SECRET || 'arulzxd-super-secret-jwt-key-999';

// ====================================================
// SCHEMAS & MODELS
// ====================================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, default: null },
    provider: { type: String, default: 'local' },
    providerId: { type: String, default: null },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    apikey: { type: String, required: true, unique: true },
    role: { type: String, default: 'Free User' },
    roleExpiresAt: { type: Date, default: null },
    limit: { type: Number, default: 0 },
    lastLimitReset: { type: Date, default: Date.now },
    avatar: { type: String, default: 'https://arulz-xd.my.id/files/X1F0Cn.png' }, 
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

const reviewSchema = new mongoose.Schema({
    productId: { type: String, required: true, index: true },
    userId: { type: String, default: null, index: true },
    username: { type: String, required: true },
    userAvatar: { type: String, default: 'https://arulz-xd.my.id/files/X1F0Cn.png' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
    media: [{
        type: { type: String, enum: ['image', 'video'] },
        url: String
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true, sparse: true });
const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);

const cacheSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 } 
});
const CacheModel = mongoose.models.Cache || mongoose.model('Cache', cacheSchema);

const voucherSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discount: { type: Number, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    expiredAt: { type: Date, required: true },
    usageLimit: { type: Number, default: 20 },
    usedCount: { type: Number, default: 0 },
    usedBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});
const Voucher = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);

const productSchema = new mongoose.Schema({
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
        default: ["https://arulz-xd.my.id/files/X1F0Cn.png"] 
    },    
    deskripsi: { type: String, default: "" },
    link: { type: String, required: true },
    purchasedBy: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

const transactionSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    paymentNumber: { type: String, default: null }, 
    paymentMethod: { type: String, default: "QRIS" },
    status: { type: String, default: "pending" }, 
    itemDetails: {
        nama: String,
        harga: Number,
        harga_diskon: Number,
        kategori: String,
        gambar: String,
        link: String,
        qty: Number
    },
    productLink: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiredAt: { type: Date, required: true },
    updatedAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

// ====================================================
// SESSION & AUTH MIDDLEWARE
// ====================================================
app.use(session({
    secret: 'store_secret_session_key_99', 
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        dbName: 'store_sessions',
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
        req.user = {
            ...decoded,
            apikey: decoded.apikey
        }; 
        next();
    } catch (err) {
        res.clearCookie('auth_session');
        req.user = null;
        next();
    }
};

app.use(checkAuthSession);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new LocalStrategy({ usernameField: 'username', passwordField: 'password' }, 
    async (usernameOrEmail, password, done) => {
        try {
            const user = await User.findOne({
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

// ====================================================
// HELPER FUNCTIONS
// ====================================================
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
                body { background-color: #0b0f19; font-family: 'Plus Jakarta Sans', sans-serif; }
                .swal2-popup { background: #111827 !important; border: 1px solid rgba(255, 255, 255, 0.08) !important; border-radius: 16px !important; }
                .swal2-title { color: #ffffff !important; font-weight: 700 !important; }
                .swal2-html-container { color: #9ca3af !important; }
                .swal2-confirm { background: linear-gradient(to right, #0891b2, #06b6d4) !important; color: #0f172a !important; font-weight: 700 !important; border-radius: 12px !important; padding: 10px 24px !important; }
            </style>
        </head>
        <body>
            <script>
                Swal.fire({ icon: '${icon}', title: '${title}', text: '${text}', confirmButtonText: 'OKE' }).then(() => {
                    window.location = '${redirectUrl}';
                });
            </script>
        </body>
        </html>
    `);
}

const PAYWUZ_API_KEY = process.env.PAYWUZ_API_KEY || "pk_live_f1429e9285d76999cc3f8bb6c3df552f";
const PAYWUZ_BASE_URL = "https://api.paywuz.id/v1";
const PAYWUZ_HEADERS = {
    "Authorization": `Bearer ${PAYWUZ_API_KEY}`,
    "Content-Type": "application/json"
};

async function axiosPaywuzWithRetry(config, maxRetries = 3, delayMs = 1500) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await axios(config);
        } catch (error) {
            const isRateLimited = error.response && error.response.status === 429;
            const isLastAttempt = i === maxRetries - 1;
            if (isRateLimited && !isLastAttempt) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
                delayMs *= 1.5; 
            } else {
                throw error;
            }
        }
    }
}

async function setCache(key, data) {
    try {
        await CacheModel.findOneAndUpdate({ key }, { data, createdAt: new Date() }, { upsert: true, new: true });
    } catch (e) {}
}

async function getCache(key) {
    try {
        const cached = await CacheModel.findOne({ key });
        return cached ? cached.data : null;
    } catch (e) {
        return null;
    }
}

async function deleteCache(key) {
    try { await CacheModel.deleteOne({ key }); } catch (e) {}
}

function scheduleTransactionDeletion(orderId) {
    setTimeout(async () => {
        try {
            await Transaction.deleteOne({ orderId });
            await deleteCache(`trx_${orderId}`);
        } catch (err) {}
    }, 60 * 1000);
}

function verifyPaywuzSignature(rawBody, receivedSignature, apikey) {
    if (!receivedSignature) return false;
    const computedSignature = "sha256=" + crypto.createHmac("sha256", apikey)
        .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)).digest("hex");
    try {
        return crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(computedSignature));
    } catch (err) {
        return false;
    }
}

async function recordProductBuyer(productName, userIdentifier) {
    if (!productName || !userIdentifier) return;
    try {
        await Product.findOneAndUpdate(
            { nama: { $regex: new RegExp(`^${productName.trim()}$`, 'i') } },
            { $addToSet: { purchasedBy: userIdentifier.toString().toLowerCase().trim() } }
        );
    } catch (err) {}
}

async function updateProductStockAndSold(productName, qtyChange = 1, isRollback = false) {
    try {
        if (!productName) return null;
        const product = await Product.findOne({ nama: { $regex: new RegExp(`^${productName.trim()}$`, 'i') } });
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
    } catch (err) {}
    return null;
}

// ====================================================
// AUTH ROUTES (LOCAL, GITHUB, GOOGLE)
// ====================================================
app.post('/auth/login', (req, res, next) => {
    passport.authenticate('local', async (err, user, info) => { 
        if (err) return next(err);
        if (!user) {
            const pesanGagal = info && info.message ? info.message : 'Username atau password salah.';
            return sendSweetAlert(res, 'error', 'Gagal Masuk', pesanGagal, '/login');
        }

        req.logIn(user, async (err) => { 
            if (err) return next(err);

            const userPayload = {
                id: user._id,
                username: user.username,
                email: user.email,
                name: user.username,
                avatar: user.avatar || 'https://arulz-xd.my.id/files/X1F0Cn.png',
                role: user.role,     
                apikey: user.apikey   
            };

            const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
            res.cookie('auth_session', token, {
                maxAge: 7 * 24 * 60 * 60 * 1000, 
                httpOnly: true,
                secure: true, 
                sameSite: 'lax'
            });

            return res.redirect('/store');
        });
    })(req, res, next);
});

app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/store'); 
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const GITHUB_CLIENT_ID = 'Ov23linJtLUZuyJVXpXZ';
const GITHUB_CLIENT_SECRET = '99834867b22a9f173a64b492e55d4e8f5ef9e9eb';
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || "https://arulz-xd.my.id/auth/github/callback";

app.get('/auth/github', (req, res) => {
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${GITHUB_CALLBACK_URL}&scope=user:email`;
    res.redirect(url);
});

app.get('/auth/github/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('Authentication failed: No code provided');

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
                if (primaryEmailObj) userEmail = primaryEmailObj.email;
            } catch (emailErr) {}
        }

        const finalEmail = (userEmail || `${userData.login}@github.com`).toLowerCase().trim();
        const currentUsername = (userData.login || finalEmail.split('@')[0]).toLowerCase().trim();

        let dbUser = await User.findOne({ email: finalEmail });

        if (!dbUser) {
            dbUser = new User({
                username: currentUsername,
                email: finalEmail,
                provider: 'github',
                providerId: String(userData.id),
                apikey: 'free-' + crypto.randomBytes(3).toString('hex').slice(0, 5),
                role: 'Free User',
                avatar: userData.avatar_url || 'https://arulz-xd.my.id/files/X1F0Cn.png'
            });
            await dbUser.save();
        }

        const userPayload = {
            id: dbUser._id,
            username: dbUser.username,
            email: dbUser.email,
            name: userData.name || dbUser.username,
            avatar: dbUser.avatar,
            role: dbUser.role,
            apikey: dbUser.apikey
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('auth_session', token, { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });
        res.redirect('/store');
    } catch (error) {
        res.send('Login Error: ' + error.message);
    }
});

const d = "613783942158";
const e = "-63q31341ivgrlulq8";
const f = "ha0m4uqmnoa6kq0";
const cl = ".apps.";
const id = "googleusercontent.com";

const GOOGLE_CLIENT_ID = `${d}${e}${f}${cl}${id}`;
const GOOGLE_CLIENT_SECRET = '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';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "https://arulz-xd.my.id/auth/google/callback";

app.get('/auth/google', (req, res) => {
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${GOOGLE_CALLBACK_URL}&response_type=code&scope=profile email`;
    res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('Authentication failed: No code provided');

    try {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: GOOGLE_CALLBACK_URL
        });

        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = tokenResponse.data.access_token;
        const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const userData = userResponse.data;
        const email = userData.email.toLowerCase().trim();
        const currentUsername = (userData.login || email.split('@')[0]).toLowerCase().trim();

        let dbUser = await User.findOne({ email: email });

        if (!dbUser) {
            dbUser = new User({
                username: currentUsername,
                email: email,
                provider: 'google',
                providerId: String(userData.id),
                apikey: 'free-' + crypto.randomBytes(3).toString('hex').slice(0, 5),
                role: 'Free User',
                avatar: userData.picture || 'https://arulz-xd.my.id/files/X1F0Cn.png'
            });
            await dbUser.save();
        }

        const userPayload = {
            id: dbUser._id,
            username: dbUser.username,
            email: dbUser.email,
            name: userData.name || dbUser.username,
            avatar: dbUser.avatar,
            role: dbUser.role,
            apikey: dbUser.apikey
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('auth_session', token, { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });
        res.redirect('/store');
    } catch (error) {
        res.send('Login Error: ' + error.message);
    }
});

app.get('/api/user-status', async (req, res) => {
    if (req.user) {
        try {
            const freshUser = await User.findById(req.user.id || req.user._id);
            const activeUser = freshUser || req.user;
            res.json({
                loggedIn: true,
                user: {
                    name: activeUser.username,
                    username: activeUser.username,
                    email: activeUser.email,
                    avatar: activeUser.avatar,
                    apikey: activeUser.apikey,
                    role: activeUser.role
                }
            });
        } catch (err) {
            res.json({ loggedIn: true, user: req.user });
        }
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/auth/logout', (req, res, next) => {
    res.clearCookie('auth_session');
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/store');
    });
});

// ====================================================
// STORE ENDPOINTS
// ====================================================
app.get('/database/produk', async (req, res) => {
    try {
        const produk = await Product.find({}).sort({ createdAt: -1 });
        res.json(produk);
    } catch (err) {
        res.status(500).json({ error: "Gagal memuat data produk" });
    }
});

app.get('/store', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

app.get('/store/:productId', async (req, res) => {
    try {
        const productId = req.params.productId;
        const product = await Product.findOne({ Id: productId });

        const storePath = path.join(__dirname, 'public', 'store.html');
        let htmlContent = fs.readFileSync(storePath, 'utf8');

        if (product) {
            const hargaFormatted = product.harga_diskon 
                ? `Rp ${product.harga_diskon.toLocaleString('id-ID')}` 
                : `Rp ${product.harga.toLocaleString('id-ID')}`;

            const deskripsiClean = product.deskripsi ? product.deskripsi.slice(0, 150) : '';

            const metaTags = `
    <!-- Open Graph / Meta Tags Dinamis -->
    <meta property="og:title" content="${product.nama} - ArulzXD Store" />
    <meta property="og:description" content="${deskripsiClean}... | Harga: ${hargaFormatted}" />
    <meta property="og:image" content="${product.gambar}" />
    <meta property="og:url" content="https://arulz-xd.my.id/store/${product.Id}" />
    <meta property="og:type" content="product" />
    <meta name="twitter:card" content="summary_large_image" />
            `;
            htmlContent = htmlContent.replace('<head>', `<head>${metaTags}`);
        }
        res.send(htmlContent);
    } catch (error) {
        res.sendFile(path.join(__dirname, 'public', 'store.html'));
    }
});

app.post('/transactions', async (req, res) => {
    try {
        const { orderId, amount, itemDetails, qty } = req.body;
        const buyQty = Number(qty) || 1;

        if (!orderId || !amount) {
            return res.status(400).json({ status: false, error: "INVALID_PAYLOAD", message: "orderId dan amount wajib diisi!" });
        }

        const existingTrx = await Transaction.findOne({ orderId });
        if (existingTrx) return res.json({ status: true, data: existingTrx });

        const inputAmount = Number(amount);

        const paywuzRes = await axiosPaywuzWithRetry({
            method: 'post',
            url: `${PAYWUZ_BASE_URL}/transactions`,
            data: { orderId, amount: inputAmount, paymentMethod: "QRIS", feeByMerchant: false },
            headers: PAYWUZ_HEADERS
        });

        const transactionData = paywuzRes.data?.data || paywuzRes.data;
        const qrisNumber = transactionData.paymentNumber || transactionData.qrString || transactionData.qrUrl;

        const feeFlatIdr = Number(transactionData.feeFlatIdr) || 290;
        const feePercentBps = Number(transactionData.feePercentBps) || 70;
        const calculatedFee = feeFlatIdr + Math.ceil((inputAmount * feePercentBps) / 10000);

        let finalAmount = transactionData.grossAmount || transactionData.totalAmount || (inputAmount + calculatedFee);

        let pLink = itemDetails?.link || null;
        if (!pLink && itemDetails?.nama) {
            const dbProduct = await Product.findOne({ nama: { $regex: new RegExp(`^${itemDetails.nama.trim()}$`, 'i') } }).lean();
            if (dbProduct) pLink = dbProduct.link;
        }

        const expiredAt = new Date(Date.now() + 15 * 60 * 1000);

        const newTransaction = new Transaction({
            orderId,
            amount: finalAmount,
            paymentNumber: qrisNumber,
            paymentMethod: "QRIS",
            status: (transactionData.status || "pending").toLowerCase(),
            itemDetails: { ...itemDetails, qty: buyQty },
            productLink: pLink,
            expiredAt: expiredAt
        });

        await newTransaction.save();
        return res.json({ status: true, data: newTransaction });

    } catch (error) {
        return res.status(500).json({
            status: false,
            error: "CREATE_TRANSACTION_FAILED",
            message: error.response?.data?.message || error.message || "Gagal membuat transaksi QRIS"
        });
    }
});

app.get('/transactions/:orderId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
        const { orderId } = req.params;
        const cachedData = await getCache(`trx_${orderId}`);
        if (cachedData) return res.json({ data: cachedData });

        let localTrx = await Transaction.findOne({ orderId });
        if (!localTrx) return res.status(404).json({ error: "TRANSACTION_NOT_FOUND", message: "Transaksi tidak ditemukan" });

        if (localTrx.status.toLowerCase() === "pending" && new Date() > new Date(localTrx.expiredAt)) {
            localTrx.status = "cancelled";
            localTrx.updatedAt = new Date();
            await localTrx.save();
            scheduleTransactionDeletion(orderId);

            const resultData = { orderId: localTrx.orderId, status: "cancelled", amount: localTrx.amount, paymentNumber: localTrx.paymentNumber, expiredAt: localTrx.expiredAt, productLink: null };
            await setCache(`trx_${orderId}`, resultData);
            return res.json({ data: resultData });
        }

        const currentStatus = localTrx.status.toLowerCase();
        const isSuccess = ["settlement", "success", "paid", "settled"].includes(currentStatus);

        const responseData = {
            orderId: localTrx.orderId,
            status: currentStatus,
            amount: localTrx.amount,
            paymentNumber: localTrx.paymentNumber,
            expiredAt: localTrx.expiredAt,
            productLink: isSuccess ? localTrx.productLink : null
        };

        await setCache(`trx_${orderId}`, responseData);
        res.json({ data: responseData });

    } catch (error) {
        res.status(500).json({ error: "TRANSACTION_FETCH_FAILED", message: "Gagal mengambil status transaksi" });
    }
});

app.post('/transactions/:orderId/cancel', async (req, res) => {
    try {
        const { orderId } = req.params;
        const localTrx = await Transaction.findOne({ orderId });
        if (!localTrx) return res.status(404).json({ status: false, message: "Transaksi tidak ditemukan" });

        const prevStatus = localTrx.status.toLowerCase();
        try {
            await axiosPaywuzWithRetry({ method: 'post', url: `${PAYWUZ_BASE_URL}/transactions/${orderId}/cancel`, headers: PAYWUZ_HEADERS });
        } catch (err) {}

        if (["paid", "settlement", "success"].includes(prevStatus)) {
            if (localTrx.itemDetails && localTrx.itemDetails.nama) {
                await updateProductStockAndSold(localTrx.itemDetails.nama, localTrx.itemDetails.qty || 1, true);
            }
        }

        localTrx.status = "cancelled";
        localTrx.updatedAt = new Date();
        await localTrx.save();

        await deleteCache(`trx_${orderId}`);
        scheduleTransactionDeletion(orderId);

        return res.json({ status: true, data: { orderId, status: "cancelled" } });
    } catch (error) {
        res.status(500).json({ error: "CANCEL_TRANSACTION_FAILED", message: error.message });
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-paywuz-signature'];
        const payloadToVerify = req.rawBody || req.body;
        const isValid = verifyPaywuzSignature(payloadToVerify, signature, PAYWUZ_API_KEY);

        if (!isValid && process.env.NODE_ENV === 'production') {
            return res.status(401).json({ error: "INVALID_SIGNATURE", message: "Signature webhook tidak valid!" });
        }

        const payload = req.body;
        const eventName = payload?.event || payload?.type; 
        const payloadData = payload?.data || payload;
        const orderId = payloadData?.orderId;
        const status = payloadData?.status ? payloadData.status.toLowerCase() : null;

        if (!orderId) return res.status(400).json({ error: "MISSING_ORDER_ID", message: "orderId tidak ada!" });

        if (orderId && status) {
            let localTrx = await Transaction.findOne({ orderId });
            if (localTrx) {
                const prevStatus = localTrx.status.toLowerCase();
                localTrx.status = status;
                localTrx.updatedAt = new Date();

                const isPaidEvent = eventName === "transaction.paid" || ["paid", "settlement", "success"].includes(status);
                const isCancelEvent = ["cancelled", "failed", "expire"].includes(status);

                if (isPaidEvent && !["paid", "settlement", "success"].includes(prevStatus)) {
                    if (localTrx.itemDetails && localTrx.itemDetails.nama) {
                        const qtyPurchased = localTrx.itemDetails.qty || 1;
                        await updateProductStockAndSold(localTrx.itemDetails.nama, qtyPurchased, false);
                        const buyerIdentifier = getUserIdentifier(req) || localTrx.paymentNumber;
                        await recordProductBuyer(localTrx.itemDetails.nama, buyerIdentifier);
                    }
                    if (!localTrx.productLink && localTrx.itemDetails?.nama) {
                        const dbProduct = await Product.findOne({ nama: { $regex: new RegExp(`^${localTrx.itemDetails.nama.trim()}$`, 'i') } }).lean();
                        if (dbProduct) localTrx.productLink = dbProduct.link;
                    }
                } else if (isCancelEvent && ["paid", "settlement", "success"].includes(prevStatus)) {
                    if (localTrx.itemDetails && localTrx.itemDetails.nama) {
                        await updateProductStockAndSold(localTrx.itemDetails.nama, localTrx.itemDetails.qty || 1, true);
                    }
                }

                await localTrx.save();
                await deleteCache(`trx_${orderId}`);

                if (["settlement", "success", "paid", "settled", "failed", "cancelled"].includes(status)) {
                    scheduleTransactionDeletion(orderId);
                }
            }
        }
        return res.status(200).json({ data: { message: "Webhook diproses dengan sukses", orderId } });
    } catch (err) {
        return res.status(500).json({ error: "WEBHOOK_PROCESSING_ERROR", message: "Error internal webhook" });
    }
});

app.post('/api/store/manual-order', async (req, res) => {
    try {
        const productName = req.body.productName;
        const qty = req.body.qty;
        const buyQty = Number(qty) || 1;

        if (!productName) return res.status(400).json({ status: false, message: "Nama produk wajib diisi!" });

        const updatedProduct = await updateProductStockAndSold(productName, buyQty);
        if (!updatedProduct) return res.status(404).json({ status: false, message: "Produk tidak ditemukan di database." });

        return res.json({ status: true, message: "Stok dan jumlah terjual berhasil diperbarui!", data: updatedProduct });
    } catch (err) {
        return res.status(500).json({ status: false, message: "Terjadi kesalahan server." });
    }
});

// Ulasan/Review Endpoints
const uploadReviewMedia = multer({
    limits: { fileSize: 10 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
        else cb(new Error('File harus berupa gambar atau video!'));
    }
});

app.post('/api/reviews', checkAuthSession, (req, res) => {
    uploadReviewMedia.array('mediaFiles', 5)(req, res, async (err) => {
        if (err) return res.status(400).json({ status: false, message: err.message });
        try {
            const { productId, rating, comment } = req.body;
            if (!productId || !rating || !comment || !comment.trim()) {
                return res.status(400).json({ status: false, message: 'Semua field ulasan wajib diisi!' });
            }

            let username = 'Anonim';
            let userAvatar = 'https://arulz-xd.my.id/files/X1F0Cn.png';
            let userId = getUserIdentifier(req);

            if (req.user) {
                username = req.user.username || req.user.name;
                userAvatar = req.user.avatar || userAvatar;
                userId = (req.user.id || req.user._id || req.user.email || req.user.username).toString();
            }

            const mediaList = [];
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    const mimeType = file.mimetype || mime.lookup(file.originalname) || '';
                    const base64 = file.buffer.toString('base64');
                    mediaList.push({ type: mimeType.startsWith('video/') ? 'video' : 'image', url: `data:${mimeType};base64,${base64}` });
                }
            }

            let existingReview = await Review.findOne({ productId, userId });
            if (existingReview) {
                existingReview.rating = Number(rating);
                existingReview.comment = comment.trim();
                if (mediaList.length > 0) existingReview.media = mediaList;
                existingReview.updatedAt = new Date();
                await existingReview.save();
                return res.json({ status: true, message: 'Penilaian berhasil diperbarui!', data: existingReview });
            } else {
                const newReview = new Review({ productId, userId, username, userAvatar, rating: Number(rating), comment: comment.trim(), media: mediaList });
                await newReview.save();
                return res.json({ status: true, message: 'Penilaian berhasil dikirim!', data: newReview });
            }
        } catch (error) {
            return res.status(500).json({ status: false, message: 'Terjadi kesalahan server saat menyimpan ulasan.' });
        }
    });
});

app.get('/api/reviews/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const reviews = await Review.find({ productId }).sort({ createdAt: -1 });
        let averageRating = reviews.length > 0 ? Number((reviews.reduce((s, i) => s + i.rating, 0) / reviews.length).toFixed(1)) : 0;
        return res.json({ status: true, totalReviews: reviews.length, averageRating, reviews });
    } catch (error) {
        return res.status(500).json({ status: false, message: 'Gagal mengambil ulasan produk.' });
    }
});

app.delete('/api/reviews/:reviewId', checkAuthSession, async (req, res) => {
    try {
        const { reviewId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(reviewId)) return res.status(400).json({ status: false, message: 'ID ulasan tidak valid!' });

        const review = await Review.findById(reviewId);
        if (!review) return res.status(404).json({ status: false, message: 'Ulasan tidak ditemukan!' });

        let currentUserId = req.user ? (req.user.id || req.user._id).toString() : getUserIdentifier(req);
        const currentUsername = req.user ? req.user.username : null;

        const isOwner = (review.userId && review.userId.toString() === currentUserId.toString()) ||
                        (currentUsername && review.username.toLowerCase() === currentUsername.toLowerCase());

        if (!isOwner) return res.status(403).json({ status: false, message: 'Anda tidak memiliki hak akses menghapus ulasan ini!' });

        await Review.findByIdAndDelete(reviewId);
        return res.json({ status: true, message: 'Ulasan berhasil dihapus!' });
    } catch (error) {
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan server.' });
    }
});

// Vouchers Endpoints
app.post('/api/vouchers/claim', async (req, res) => {
    try {
        const code = req.body.code;
        if (!code) return res.status(400).json({ status: false, message: 'Kode voucher wajib diisi!' });
        const cleanCode = code.trim().toUpperCase();
        const userIdentifier = getUserIdentifier(req);
        const voucher = await Voucher.findOne({ code: cleanCode });

        if (!voucher) return res.status(404).json({ status: false, message: 'Kode voucher tidak ditemukan!' });
        if (voucher.usageLimit <= 0) return res.status(400).json({ status: false, reason: 'limit_reached', message: 'Kuota penggunaan voucher ini sudah habis!' });
        if (voucher.usedBy && voucher.usedBy.includes(userIdentifier)) return res.status(400).json({ status: false, reason: 'already_used', message: 'Anda sudah pernah menggunakan voucher ini!' });
        if (new Date() > new Date(voucher.expiredAt)) return res.status(400).json({ status: false, reason: 'expired', message: 'Voucher telah kedaluwarsa!' });

        voucher.usedCount += 1;
        voucher.usageLimit = Math.max(0, voucher.usageLimit - 1); 
        if (!voucher.usedBy) voucher.usedBy = [];
        voucher.usedBy.push(userIdentifier);
        await voucher.save();

        return res.json({ status: true, message: 'Voucher berhasil diklaim!', voucher: { code: voucher.code, discount: voucher.discount, type: voucher.type } });
    } catch (err) {
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan pada server.' });
    }
});

app.listen(PORT, () => {
    console.log(`🛒 Store Web Server running on http://localhost:${PORT}`);
});

module.exports = app;
