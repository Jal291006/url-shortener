const mongoose = require('mongoose');

// Define the blueprint for our data
const urlSchema = new mongoose.Schema({
    urlCode: String,     // The random 5-character string (e.g., 'aBcD3')
    longUrl: String,     // The original URL the user gave us
    shortUrl: String,    // The final short link we give back
    clicks: {
        type: Number,
        required: true,
        default: 0
    },
    analytics: [
        {
            timestamp: {
                type: Date,
                default: Date.now
            },
            referrer: {
                type: String,
                default: 'Direct'
            },
            ip: {
                type: String,
                default: 'Unknown'
            },
            userAgent: {
                type: String,
                default: 'Unknown'
            }
        }
    ],
    date: { 
        type: Date, 
        default: Date.now // Automatically saves when this link was created
    }
});

// Export this blueprint so we can use it in server.js
module.exports = mongoose.model('Url', urlSchema);