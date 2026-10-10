const fs = require('fs');
const path = require('path');
const Url = require('./Url');

// Path for local standalone persistence when MongoDB is not connected
const DATA_FILE = path.join(__dirname, 'urls_data.json');

// In-memory cache synced with JSON file if available
let localStore = [];

function loadLocalStore() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf-8');
            localStore = JSON.parse(data);
        }
    } catch (err) {
        console.warn('Could not read local data file, initializing in-memory store:', err.message);
        localStore = [];
    }
}

function saveLocalStore() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(localStore, null, 2), 'utf-8');
    } catch (err) {
        // In serverless / read-only filesystem environments, file saving may fail silently
        // and keep in memory for the lifecycle of the instance
    }
}

// Load on start
loadLocalStore();

class DataStore {
    constructor() {
        this.isMongo = false;
    }

    setMongoActive(active) {
        this.isMongo = active;
    }

    async findByCode(code) {
        if (this.isMongo) {
            return await Url.findOne({ urlCode: code });
        }
        return localStore.find(item => item.urlCode === code) || null;
    }

    async saveUrl({ longUrl, shortUrl, urlCode }) {
        if (this.isMongo) {
            const newUrl = new Url({
                longUrl,
                shortUrl,
                urlCode
            });
            return await newUrl.save();
        }

        const newEntry = {
            urlCode,
            longUrl,
            shortUrl,
            clicks: 0,
            analytics: [],
            date: new Date()
        };
        localStore.push(newEntry);
        saveLocalStore();
        return newEntry;
    }

    async recordVisit(code, visitData) {
        if (this.isMongo) {
            return await Url.findOneAndUpdate(
                { urlCode: code },
                {
                    $inc: { clicks: 1 },
                    $push: { analytics: visitData }
                },
                { new: true }
            );
        }

        const entry = localStore.find(item => item.urlCode === code);
        if (entry) {
            entry.clicks = (entry.clicks || 0) + 1;
            if (!entry.analytics) entry.analytics = [];
            entry.analytics.push(visitData);
            saveLocalStore();
            return entry;
        }
        return null;
    }

    async getRecentUrls(limit = 50) {
        if (this.isMongo) {
            return await Url.find({})
                .sort({ date: -1 })
                .limit(limit);
        }
        return [...localStore]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);
    }

    async deleteUrl(code) {
        if (this.isMongo) {
            return await Url.findOneAndDelete({ urlCode: code });
        }
        const index = localStore.findIndex(item => item.urlCode === code);
        if (index !== -1) {
            const removed = localStore.splice(index, 1)[0];
            saveLocalStore();
            return removed;
        }
        return null;
    }
}

module.exports = new DataStore();
