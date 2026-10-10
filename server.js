require('dotenv').config(); 

// --- FORCE GOOGLE DNS TO BYPASS ROUTER BLOCK ---
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
// -----------------------------------------------

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose'); 
const { nanoid } = require('nanoid'); 

const dbStore = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve frontend UI from the public folder

// --- DATABASE CONNECTION (DUAL-MODE) ---
const DB_LINK = process.env.MONGO_URI;
let isConnected = false;

async function connectDB() {
    if (isConnected || !DB_LINK || DB_LINK.trim() === '') return;
    try {
        await mongoose.connect(DB_LINK);
        isConnected = true;
        dbStore.setMongoActive(true);
        console.log('✅ Connected to MongoDB!');
    } catch (err) {
        console.warn('⚠️ MongoDB connection error. Falling back to local storage mode:', err.message);
        dbStore.setMongoActive(false);
    }
}

// Ensure DB is initialized before handling requests
app.use(async (req, res, next) => {
    if (DB_LINK && !isConnected) {
        await connectDB();
    }
    next();
});

// Initial boot connection attempt for local server
connectDB();
// ---------------------------------------

// --- 1. ROUTE TO CREATE A SHORT URL ---
app.post('/shorten', async (req, res) => {
    let { longUrl, customAlias } = req.body; 
    
    if (!longUrl) {
        return res.status(400).json({ error: 'longUrl is required' });
    }

    // Ensure URL has protocol
    if (!/^https?:\/\//i.test(longUrl)) {
        longUrl = 'https://' + longUrl;
    }

    let urlCode;
    if (customAlias && customAlias.trim().length > 0) {
        urlCode = customAlias.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (urlCode.length < 3) {
            return res.status(400).json({ error: 'Custom alias must be at least 3 characters long.' });
        }
        // Check if custom code already exists
        const existing = await dbStore.findByCode(urlCode);
        if (existing) {
            return res.status(409).json({ error: 'This custom alias is already in use. Please pick another.' });
        }
    } else {
        urlCode = nanoid(6); 
    }
    
    // Dynamically uses whatever domain the app is running on (e.g. localhost or your future online domain!)
    const baseUrl = `${req.protocol}://${req.get('host')}`; 
    const shortUrl = `${baseUrl}/${urlCode}`;

    try {
        const savedUrl = await dbStore.saveUrl({
            longUrl,
            shortUrl,
            urlCode
        });

        res.json(savedUrl); 
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error while saving URL' });
    }
});

// --- 2. ROUTE TO REDIRECT TO THE ORIGINAL URL & TRACK CLICKS ---
app.get('/:code', async (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'Unknown';
        const referrer = req.get('Referrer') || req.get('Referer') || 'Direct';
        const userAgent = req.get('User-Agent') || 'Unknown';

        const visitData = {
            timestamp: new Date(),
            referrer: referrer,
            ip: clientIp,
            userAgent: userAgent
        };

        const url = await dbStore.recordVisit(req.params.code, visitData);

        if (url) {
            return res.redirect(url.longUrl);
        } else {
            return res.status(404).json('No URL found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).json('Server Error while searching for URL');
    }
});

// --- 3. ROUTE TO GET ANALYTICS FOR A SHORT URL ---
app.get('/api/analytics/:code', async (req, res) => {
    try {
        const url = await dbStore.findByCode(req.params.code);

        if (!url) {
            return res.status(404).json({ error: 'No URL found' });
        }

        res.json({
            urlCode: url.urlCode,
            longUrl: url.longUrl,
            shortUrl: url.shortUrl,
            clicks: url.clicks || 0,
            createdAt: url.date,
            analytics: url.analytics || []
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error while fetching analytics' });
    }
});

// --- 4. ROUTE TO GET ALL SHORTENED LINKS (HISTORY) ---
app.get('/api/urls', async (req, res) => {
    try {
        const urls = await dbStore.getRecentUrls(100);
        res.json(urls);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error while fetching links history' });
    }
});

// --- 5. ROUTE TO DELETE A LINK ---
app.delete('/api/urls/:code', async (req, res) => {
    try {
        const removed = await dbStore.deleteUrl(req.params.code);
        if (!removed) {
            return res.status(404).json({ error: 'URL not found or already deleted' });
        }
        res.json({ message: 'URL deleted successfully', urlCode: req.params.code });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error while deleting URL' });
    }
});

// --- START SERVER / EXPORT FOR VERCEL ---
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server is running locally on http://localhost:${PORT}`);
    });
}

module.exports = app;