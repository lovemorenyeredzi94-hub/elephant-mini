/**
 * Database Manager - Supports both Sequelize and JSON storage
 * Uses JSON files for simplicity, with Sequelize compatibility
 */

const fs = require('fs');
const path = require('path');

// ====================================
// JSON DATABASE SETUP
// ====================================

const DB_PATH = path.join(__dirname, '../database');
const GROUPS_DB = path.join(DB_PATH, 'groups.json');
const USERS_DB = path.join(DB_PATH, 'users.json');
const WARNINGS_DB = path.join(DB_PATH, 'warnings.json');
const SESSIONS_DB = path.join(DB_PATH, 'sessions.json');
const STATS_DB = path.join(DB_PATH, 'stats.json');
const ACTIVE_DB = path.join(DB_PATH, 'active.json');
const MUTED_DB = path.join(DB_PATH, 'muted.json');
const PAIRING_DB = path.join(DB_PATH, 'pairing.json');

// Initialize database directory
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

// Initialize database files
const initDB = (filePath, defaultData = {}) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
};

initDB(GROUPS_DB, {});
initDB(USERS_DB, {});
initDB(WARNINGS_DB, {});
initDB(SESSIONS_DB, {});
initDB(STATS_DB, {});
initDB(ACTIVE_DB, {});
initDB(MUTED_DB, {});
initDB(PAIRING_DB, {});

// Read database
const readDB = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading database: ${error.message}`);
        return {};
    }
};

// Write database
const writeDB = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing database: ${error.message}`);
        return false;
    }
};

// ====================================
// SEQUELIZE DATABASE (For compatibility)
// ====================================

class DatabaseManager {
    static instance = null;

    static getInstance() {
        if (!DatabaseManager.instance) {
            const DATABASE_URL = process.env.DATABASE_URL || './database.db';

            DatabaseManager.instance =
                DATABASE_URL === './database.db'
                    ? new Sequelize({
                            dialect: 'sqlite',
                            storage: DATABASE_URL,
                            logging: false,
                      })
                    : new Sequelize(DATABASE_URL, {
                            dialect: 'postgres',
                            ssl: true,
                            protocol: 'postgres',
                            dialectOptions: {
                                native: true,
                                ssl: { require: true, rejectUnauthorized: false },
                            },
                            logging: false,
                      });
        }
        return DatabaseManager.instance;
    }
}

const DATABASE = DatabaseManager.getInstance();

// Sync database (only if using SQL/Postgres)
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== './database.db') {
    DATABASE.sync()
        .then(() => {
            console.log('Database synchronized successfully.');
        })
        .catch((error) => {
            console.error('Error synchronizing the database:', error);
        });
}

// ====================================
// SESSION FUNCTIONS
// ====================================

function saveSessionToDB(sessionId, credentials) {
    try {
        const sessions = readDB(SESSIONS_DB);
        sessions[sessionId] = {
            credentials: credentials,
            updatedAt: new Date().toISOString()
        };
        return writeDB(SESSIONS_DB, sessions);
    } catch (error) {
        console.error('❌ Error saving session:', error);
        return false;
    }
}

function getSessionFromDB(sessionId) {
    try {
        const sessions = readDB(SESSIONS_DB);
        return sessions[sessionId]?.credentials || null;
    } catch (error) {
        console.error('❌ Error getting session:', error);
        return null;
    }
}

function deleteSessionFromDB(sessionId) {
    try {
        const sessions = readDB(SESSIONS_DB);
        delete sessions[sessionId];
        return writeDB(SESSIONS_DB, sessions);
    } catch (error) {
        console.error('❌ Error deleting session:', error);
        return false;
    }
}

function getAllSessionsFromDB() {
    try {
        const sessions = readDB(SESSIONS_DB);
        return Object.keys(sessions);
    } catch (error) {
        console.error('❌ Error getting sessions:', error);
        return [];
    }
}

// ====================================
// USER CONFIG FUNCTIONS
// ====================================

function getUserConfigFromDB(sessionId) {
    try {
        const users = readDB(USERS_DB);
        if (!users[sessionId]) {
            users[sessionId] = {
                prefix: '.',
                config: {
                    AUTO_RECORDING: 'false',
                    AUTO_TYPING: 'false',
                    ANTI_CALL: 'false',
                    READ_MESSAGE: 'false',
                    AUTO_VIEW_STATUS: 'true',
                    AUTO_LIKE_STATUS: 'true',
                    AUTO_STATUS_REPLY: 'false',
                    AUTO_STATUS_MSG: 'Your status has been seen!',
                    AUTO_LIKE_EMOJI: ['❤️', '🔥', '💫', '🌟']
                }
            };
            writeDB(USERS_DB, users);
        }
        return users[sessionId];
    } catch (error) {
        console.error('❌ Error getting user config:', error);
        return null;
    }
}

function updateUserConfigInDB(sessionId, updates) {
    try {
        const users = readDB(USERS_DB);
        if (!users[sessionId]) {
            users[sessionId] = {};
        }
        users[sessionId] = { ...users[sessionId], ...updates };
        return writeDB(USERS_DB, users);
    } catch (error) {
        console.error('❌ Error updating user config:', error);
        return false;
    }
}

// ====================================
// STATS FUNCTIONS
// ====================================

function incrementStats(sessionId, field) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const stats = readDB(STATS_DB);
        
        if (!stats[sessionId]) {
            stats[sessionId] = {};
        }
        if (!stats[sessionId][today]) {
            stats[sessionId][today] = {
                commandsUsed: 0,
                messagesReceived: 0,
                messagesSent: 0,
                groupsInteracted: 0
            };
        }
        
        stats[sessionId][today][field] = (stats[sessionId][today][field] || 0) + 1;
        return writeDB(STATS_DB, stats);
    } catch (error) {
        console.error('❌ Error updating stats:', error);
        return false;
    }
}

function getStatsForSession(sessionId, days = 7) {
    try {
        const stats = readDB(STATS_DB);
        if (!stats[sessionId]) return [];
        
        const result = [];
        const dates = Object.keys(stats[sessionId]).sort().reverse();
        
        for (const date of dates.slice(0, days)) {
            result.push({
                date: date,
                ...stats[sessionId][date]
            });
        }
        return result;
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        return [];
    }
}

// ====================================
// PAIRING CODE FUNCTIONS
// ====================================

function savePairingCodeToDB(sessionId, number, code) {
    try {
        const pairing = readDB(PAIRING_DB);
        pairing[sessionId] = {
            number: number,
            code: code,
            expiresAt: Date.now() + 10 * 60000
        };
        return writeDB(PAIRING_DB, pairing);
    } catch (error) {
        console.error('❌ Error saving pairing code:', error);
        return false;
    }
}

function getPairingCodeFromDB(sessionId) {
    try {
        const pairing = readDB(PAIRING_DB);
        if (pairing[sessionId] && pairing[sessionId].expiresAt > Date.now()) {
            return pairing[sessionId].code;
        }
        return null;
    } catch (error) {
        console.error('❌ Error getting pairing code:', error);
        return null;
    }
}

// ====================================
// ACTIVE NUMBER FUNCTIONS
// ====================================

function addActiveNumberToDB(sessionId, number) {
    try {
        const active = readDB(ACTIVE_DB);
        active[sessionId] = {
            number: number,
            lastConnected: new Date().toISOString(),
            isActive: true
        };
        return writeDB(ACTIVE_DB, active);
    } catch (error) {
        console.error('❌ Error adding active number:', error);
        return false;
    }
}

function removeActiveNumberFromDB(sessionId) {
    try {
        const active = readDB(ACTIVE_DB);
        delete active[sessionId];
        return writeDB(ACTIVE_DB, active);
    } catch (error) {
        console.error('❌ Error removing active number:', error);
        return false;
    }
}

function getAllActiveNumbersFromDB() {
    try {
        const active = readDB(ACTIVE_DB);
        return Object.keys(active);
    } catch (error) {
        console.error('❌ Error getting active numbers:', error);
        return [];
    }
}

// ====================================
// GROUP SETTINGS FUNCTIONS
// ====================================

function getGroupSettingsFromDB(groupId) {
    try {
        const groups = readDB(GROUPS_DB);
        if (!groups[groupId]) {
            groups[groupId] = {
                antiLink: false,
                antiLinkAction: 'delete',
                allowedDomains: ['youtube.com', 'youtu.be', 'instagram.com'],
                antiSpam: false,
                spamThreshold: 5,
                spamAction: 'delete',
                antiBadword: false,
                badwordAction: 'delete',
                customBadwords: [],
                antiVoice: false,
                antiVoiceAction: 'delete',
                antiSticker: false,
                antiStickerAction: 'delete',
                antiPrivacy: false,
                antiDelete: false,
                antigroupstatus: false,
                antigroupstatusAction: 'delete',
                antigroupmention: false,
                antigroupmentionAction: 'delete',
                antitag: false,
                antitagAction: 'delete',
                antiall: false,
                welcome: true,
                welcomeMessage: '👋 Welcome @user to the group!',
                goodbye: true,
                goodbyeMessage: '👋 @user has left the group!',
                leveling: false,
                levelUpMessage: true,
                autoDelete: false,
                autoDeleteTime: 60,
                nsfw: false,
                muted: false,
                mutedUntil: null,
                language: 'en',
                prefix: '.',
                chatbot: false,
                autosticker: false,
                maxWarnings: 3
            };
            writeDB(GROUPS_DB, groups);
        }
        return { settings: groups[groupId] };
    } catch (error) {
        console.error('❌ Error getting group settings:', error);
        return { settings: {} };
    }
}

function updateGroupSettingsInDB(groupId, updates) {
    try {
        const groups = readDB(GROUPS_DB);
        if (!groups[groupId]) {
            groups[groupId] = {};
        }
        groups[groupId] = { ...groups[groupId], ...updates };
        return writeDB(GROUPS_DB, groups);
    } catch (error) {
        console.error('❌ Error updating group settings:', error);
        return false;
    }
}

function toggleGroupSetting(groupId, setting, value) {
    try {
        const groups = readDB(GROUPS_DB);
        if (!groups[groupId]) {
            groups[groupId] = {};
        }
        groups[groupId][setting] = value;
        return writeDB(GROUPS_DB, groups);
    } catch (error) {
        console.error(`❌ Error toggling ${setting}:`, error);
        return false;
    }
}

// ====================================
// WARNING FUNCTIONS
// ====================================

function addWarningToDB(groupId, userId, reason, warnedBy = null) {
    try {
        const warnings = readDB(WARNINGS_DB);
        const key = `${groupId}_${userId}`;
        
        if (!warnings[key]) {
            warnings[key] = { count: 0, warnings: [] };
        }
        
        warnings[key].count++;
        warnings[key].warnings.push({
            reason: reason,
            date: new Date().toISOString(),
            warnedBy: warnedBy
        });
        
        writeDB(WARNINGS_DB, warnings);
        return warnings[key];
    } catch (error) {
        console.error('❌ Error adding warning:', error);
        return null;
    }
}

function getWarningsFromDB(groupId, userId) {
    try {
        const warnings = readDB(WARNINGS_DB);
        const key = `${groupId}_${userId}`;
        return warnings[key] || { count: 0, warnings: [] };
    } catch (error) {
        console.error('❌ Error getting warnings:', error);
        return { count: 0, warnings: [] };
    }
}

function removeWarningFromDB(groupId, userId) {
    try {
        const warnings = readDB(WARNINGS_DB);
        const key = `${groupId}_${userId}`;
        if (warnings[key] && warnings[key].count > 0) {
            warnings[key].count--;
            warnings[key].warnings.pop();
            writeDB(WARNINGS_DB, warnings);
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Error removing warning:', error);
        return false;
    }
}

function clearWarningsFromDB(groupId, userId) {
    try {
        const warnings = readDB(WARNINGS_DB);
        const key = `${groupId}_${userId}`;
        delete warnings[key];
        return writeDB(WARNINGS_DB, warnings);
    } catch (error) {
        console.error('❌ Error clearing warnings:', error);
        return false;
    }
}

// ====================================
// MUTE FUNCTIONS
// ====================================

function muteUserInDB(groupId, userId, duration, reason = 'No reason', mutedBy = null) {
    try {
        const muted = readDB(MUTED_DB);
        const key = `${groupId}_${userId}`;
        muted[key] = {
            until: Date.now() + duration,
            reason: reason,
            mutedBy: mutedBy
        };
        return writeDB(MUTED_DB, muted);
    } catch (error) {
        console.error('❌ Error muting user:', error);
        return false;
    }
}

function unmuteUserInDB(groupId, userId) {
    try {
        const muted = readDB(MUTED_DB);
        const key = `${groupId}_${userId}`;
        delete muted[key];
        return writeDB(MUTED_DB, muted);
    } catch (error) {
        console.error('❌ Error unmuting user:', error);
        return false;
    }
}

function isUserMutedInDB(groupId, userId) {
    try {
        const muted = readDB(MUTED_DB);
        const key = `${groupId}_${userId}`;
        return muted[key] && muted[key].until > Date.now();
    } catch (error) {
        console.error('❌ Error checking mute:', error);
        return false;
    }
}

function getMutedUsersInDB(groupId) {
    try {
        const muted = readDB(MUTED_DB);
        const result = [];
        const now = Date.now();
        for (const [key, data] of Object.entries(muted)) {
            if (data.until > now) {
                const [gId, uId] = key.split('_');
                result.push({ groupId: gId, userId: uId, ...data });
            }
        }
        return result;
    } catch (error) {
        console.error('❌ Error getting muted users:', error);
        return [];
    }
}

// ====================================
// SPAM TRACKER FUNCTIONS
// ====================================

const spamTracker = new Map();

function trackMessageForSpam(groupId, userId) {
    try {
        const key = `${groupId}_${userId}`;
        const now = Date.now();
        
        if (!spamTracker.has(key)) {
            spamTracker.set(key, {
                count: 1,
                resetTime: now + 60000
            });
            return 1;
        }
        
        const data = spamTracker.get(key);
        if (now > data.resetTime) {
            data.count = 1;
            data.resetTime = now + 60000;
        } else {
            data.count++;
        }
        spamTracker.set(key, data);
        return data.count;
    } catch (error) {
        console.error('❌ Error tracking spam:', error);
        return 0;
    }
}

// Clean up spam tracker every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of spamTracker) {
        if (now > data.resetTime) {
            spamTracker.delete(key);
        }
    }
}, 5 * 60 * 1000);

// ====================================
// CONNECT FUNCTION (For compatibility)
// ====================================

function connectDB() {
    console.log('✅ Database ready (JSON-based)');
    return Promise.resolve(true);
}

// ====================================
// EXPORTS
// ====================================

module.exports = {
    // Sequelize instance (for compatibility)
    DATABASE,
    
    // Connection
    connectDB,
    
    // Session functions
    saveSessionToDB,
    getSessionFromDB,
    deleteSessionFromDB,
    getAllSessionsFromDB,
    
    // Config functions
    getUserConfigFromDB,
    updateUserConfigInDB,
    
    // Pairing functions
    savePairingCodeToDB,
    getPairingCodeFromDB,
    
    // Active number functions
    addActiveNumberToDB,
    removeActiveNumberFromDB,
    getAllActiveNumbersFromDB,
    
    // Stats functions
    incrementStats,
    getStatsForSession,
    
    // Group settings functions
    getGroupSettingsFromDB,
    updateGroupSettingsInDB,
    toggleGroupSetting,
    
    // Warning functions
    addWarningToDB,
    getWarningsFromDB,
    removeWarningFromDB,
    clearWarningsFromDB,
    
    // Mute functions
    muteUserInDB,
    unmuteUserInDB,
    isUserMutedInDB,
    getMutedUsersInDB,
    
    // Anti-Spam functions
    trackMessageForSpam
};
