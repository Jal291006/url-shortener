require('dotenv').config(); 

// --- FORCE GOOGLE DNS TO BYPASS ROUTER BLOCK ---
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
// -----------------------------------------------

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose'); 

const Url = require('./Url'); 
const { nanoid } = require('nanoid'); 

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve frontend UI from the public folder

// --- DATABASE CONNECTION ---
const DB_LINK = process.env.MONGO_URI;

mongoose.connect(DB_LINK)
.then(() => console.log('Connected to MongoDB!'))
.catch((err) => console.error('Database connection error:', err));
// ---------------------------

// --- 1. ROUTE TO CREATE A SHORT URL ---
app.post('/shorten', async (req, res) => {
    const { longUrl } = req.body; 
    const urlCode = nanoid(6); 
    
    // Dynamically uses whatever domain the app is running on (e.g. localhost or your future online domain!)
    const baseUrl = `${req.protocol}://${req.get('host')}`; 
    const shortUrl = `${baseUrl}/${urlCode}`;

    try {
        const newUrl = new Url({
            longUrl: longUrl,
            shortUrl: shortUrl,
            urlCode: urlCode
        });

        await newUrl.save();
        res.json(newUrl); 
    } catch (err) {
        console.error(err);
        res.status(500).json('Server Error while saving URL');
    }
});

// --- 2. ROUTE TO REDIRECT TO THE ORIGINAL URL ---
app.get('/:code', async (req, res) => {
    try {
        const url = await Url.findOne({ urlCode: req.params.code });

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

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running locally on http://localhost:${PORT}`);
});