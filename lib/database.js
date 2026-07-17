const mongoose = require('mongoose');
require('dotenv').config();

// ====================================
// CONNECTION
// ====================================

const connectDB = async () => {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/elephant-mini', {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log("✅ MongoDB Connected Successfully");
        return true;
    } catch (error) {
        console.error("❌ MongoDB Connection Failed:", error.message);
        return false;
    }
};

// ====================================
// SCHEMAS
// ====================================

// 1. Session Schema (WhatsApp Auth)
const sessionSchema = new mongoose.Schema({
    sessionId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    credentials: {
        type: Object,
        required: true
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 2. User Config Schema
const userConfigSchema = new mongoose.Schema({
    sessionId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    prefix: { type: String, default: '.' },
    config: {
        AUTO_RECORDING: { type: String, default: 'false' },
        AUTO_TYPING: { type: String, default: 'false' },
        ANTI_CALL: { type: String, default: 'false' },
        READ_MESSAGE: { type: String, default: 'false' },
        AUTO_VIEW_STATUS: { type: String, default: 'true' },
        AUTO_LIKE_STATUS: { type: String, default: 'true' },
        AUTO_STATUS_REPLY: { type: String, default: 'false' },
        AUTO_STATUS_MSG: { type: String, default: 'Your status has been seen!' },
        AUTO_LIKE_EMOJI: { type: Array, default: ['❤️', '🔥', '💫', '🌟'] }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 3. Stats Schema
const statsSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    commandsUsed: { type: Number, default: 0 },
    messagesReceived: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    groupsInteracted: { type: Number, default: 0 }
});

// 4. Pairing Code Schema (temporary)
const pairingCodeSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    number: { type: String, required: true },
    expiresAt: { 
        type: Date, 
        default: () => new Date(Date.now() + 10 * 60000), // 10 minutes
        index: { expires: '10m' }
    },
    createdAt: { type: Date, default: Date.now }
});

// 5. Active Numbers Schema (for tracking)
const activeNumberSchema = new mongoose.Schema({
    sessionId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    number: { type: String, required: true },
    lastConnected: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
});

// 6. Group Settings Schema
const groupSettingsSchema = new mongoose.Schema({
    groupId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    settings: {
        // Anti-Link
        antiLink: { type: Boolean, default: false },
        antiLinkAction: { type: String, enum: ['delete', 'warn', 'kick'], default: 'delete' },
        allowedDomains: { type: [String], default: ['youtube.com', 'youtu.be', 'instagram.com'] },
        
        // Anti-Spam
        antiSpam: { type: Boolean, default: false },
        spamThreshold: { type: Number, default: 5 },
        spamAction: { type: String, enum: ['delete', 'warn', 'kick'], default: 'delete' },
        
        // Anti-Badword
        antiBadword: { type: Boolean, default: false },
        badwordAction: { type: String, enum: ['delete', 'warn', 'kick'], default: 'delete' },
        customBadwords: { type: [String], default: [] },
        
        // Anti-Voice Note
        antiVoice: { type: Boolean, default: false },
        antiVoiceAction: { type: String, enum: ['delete', 'warn'], default: 'delete' },
        
        // Anti-Sticker
        antiSticker: { type: Boolean, default: false },
        antiStickerAction: { type: String, enum: ['delete', 'warn'], default: 'delete' },
        
        // Anti-Privacy (view once messages)
        antiPrivacy: { type: Boolean, default: false },
        
        // Anti-Delete
        antiDelete: { type: Boolean, default: false },
        
        // Anti-Group Status
        antigroupstatus: { type: Boolean, default: false },
        antigroupstatusAction: { type: String, enum: ['delete', 'kick'], default: 'delete' },
        
        // Anti-Group Mention (tag-all)
        antigroupmention: { type: Boolean, default: false },
        antigroupmentionAction: { type: String, enum: ['delete', 'kick'], default: 'delete' },
        
        // Anti-Tag
        antitag: { type: Boolean, default: false },
        antitagAction: { type: String, enum: ['delete', 'kick'], default: 'delete' },
        
        // Anti-All
        antiall: { type: Boolean, default: false },
        
        // Welcome/Goodbye
        welcome: { type: Boolean, default: true },
        welcomeMessage: { type: String, default: '👋 Welcome @user to the group!' },
        goodbye: { type: Boolean, default: true },
        goodbyeMessage: { type: String, default: '👋 @user has left the group!' },
        
        // Leveling
        leveling: { type: Boolean, default: false },
        levelUpMessage: { type: Boolean, default: true },
        
        // Auto-Delete
        autoDelete: { type: Boolean, default: false },
        autoDeleteTime: { type: Number, default: 60 },
        
        // NSFW
        nsfw: { type: Boolean, default: false },
        
        // Mute
        muted: { type: Boolean, default: false },
        mutedUntil: { type: Date, default: null },
        
        // Language
        language: { type: String, default: 'en' },
        
        // Prefix override
        prefix: { type: String, default: '.' },
        
        // Chatbot
        chatbot: { type: Boolean, default: false },
        
        // AutoSticker
        autosticker: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 7. Warnings Schema
const warningSchema = new mongoose.Schema({
    groupId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    warnings: [{
        reason: { type: String, required: true },
        date: { type: Date, default: Date.now },
        warnedBy: { type: String }
    }],
    warningCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// 8. Muted Users Schema
const mutedUserSchema = new mongoose.Schema({
    groupId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    until: { type: Date, required: true },
    reason: { type: String, default: 'No reason provided' },
    mutedBy: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// 9. Spam Tracker Schema
const spamTrackerSchema = new mongoose.Schema({
    groupId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    messageCount: { type: Number, default: 0 },
    firstMessageTime: { type: Date, default: Date.now },
    lastMessageTime: { type: Date, default: Date.now },
    resetTime: { type: Date, default: () => new Date(Date.now() + 60000) }
});

// ====================================
// MODELS
// ====================================

const Session = mongoose.model('Session', sessionSchema);
const UserConfig = mongoose.model('UserConfig', userConfigSchema);
const Stats = mongoose.model('Stats', statsSchema);
const PairingCode = mongoose.model('PairingCode', pairingCodeSchema);
const ActiveNumber = mongoose.model('ActiveNumber', activeNumberSchema);
const GroupSettings = mongoose.model('GroupSettings', groupSettingsSchema);
const Warning = mongoose.model('Warning', warningSchema);
const MutedUser = mongoose.model('MutedUser', mutedUserSchema);
const SpamTracker = mongoose.model('SpamTracker', spamTrackerSchema);

// ====================================
// SESSION FUNCTIONS
// ====================================

// Save session to MongoDB
async function saveSessionToDB(sessionId, credentials) {
    try {
        await Session.findOneAndUpdate(
            { sessionId: sessionId },
            { 
                credentials: credentials,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`📁 Session saved to MongoDB for ${sessionId}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving session to MongoDB:', error);
        return false;
    }
}

// Get session from MongoDB
async function getSessionFromDB(sessionId) {
    try {
        const session = await Session.findOne({ sessionId: sessionId });
        return session ? session.credentials : null;
    } catch (error) {
        console.error('❌ Error getting session from MongoDB:', error);
        return null;
    }
}

// Delete session from MongoDB
async function deleteSessionFromDB(sessionId) {
    try {
        await Session.deleteOne({ sessionId: sessionId });
        await UserConfig.deleteOne({ sessionId: sessionId });
        await ActiveNumber.deleteOne({ sessionId: sessionId });
        console.log(`🗑️ Session deleted from MongoDB for ${sessionId}`);
        return true;
    } catch (error) {
        console.error('❌ Error deleting session from MongoDB:', error);
        return false;
    }
}

// Get all sessions
async function getAllSessionsFromDB() {
    try {
        const sessions = await Session.find({});
        return sessions.map(s => s.sessionId);
    } catch (error) {
        console.error('❌ Error getting sessions from MongoDB:', error);
        return [];
    }
}

// ====================================
// USER CONFIG FUNCTIONS
// ====================================

// Get user config
async function getUserConfigFromDB(sessionId) {
    try {
        let config = await UserConfig.findOne({ sessionId: sessionId });
        
        if (!config) {
            // Create default config
            config = new UserConfig({
                sessionId: sessionId,
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
            });
            await config.save();
            console.log(`📝 Created default config for ${sessionId}`);
        }
        return config;
    } catch (error) {
        console.error('❌ Error getting user config:', error);
        return null;
    }
}

// Update user config
async function updateUserConfigInDB(sessionId, updates) {
    try {
        await UserConfig.findOneAndUpdate(
            { sessionId: sessionId },
            { 
                ...updates,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`⚙️ Config updated for ${sessionId}`);
        return true;
    } catch (error) {
        console.error('❌ Error updating user config:', error);
        return false;
    }
}

// ====================================
// PAIRING CODE FUNCTIONS
// ====================================

// Save pairing code
async function savePairingCodeToDB(sessionId, number, code) {
    try {
        // Delete old codes first
        await PairingCode.deleteMany({ sessionId: sessionId });
        
        await PairingCode.create({
            sessionId: sessionId,
            number: number,
            code: code,
            expiresAt: new Date(Date.now() + 10 * 60000)
        });
        console.log(`🔐 Pairing code saved for ${sessionId}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving pairing code:', error);
        return false;
    }
}

// Get pairing code
async function getPairingCodeFromDB(sessionId) {
    try {
        const pairing = await PairingCode.findOne({ 
            sessionId: sessionId,
            expiresAt: { $gt: new Date() }
        });
        return pairing ? pairing.code : null;
    } catch (error) {
        console.error('❌ Error getting pairing code:', error);
        return null;
    }
}

// ====================================
// ACTIVE NUMBER FUNCTIONS
// ====================================

// Add active number
async function addActiveNumberToDB(sessionId, number) {
    try {
        await ActiveNumber.findOneAndUpdate(
            { sessionId: sessionId },
            { 
                number: number,
                lastConnected: new Date(),
                isActive: true
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Active number added: ${number}`);
        return true;
    } catch (error) {
        console.error('❌ Error adding active number:', error);
        return false;
    }
}

// Remove active number
async function removeActiveNumberFromDB(sessionId) {
    try {
        await ActiveNumber.deleteOne({ sessionId: sessionId });
        console.log(`🗑️ Active number removed: ${sessionId}`);
        return true;
    } catch (error) {
        console.error('❌ Error removing active number:', error);
        return false;
    }
}

// Get all active numbers
async function getAllActiveNumbersFromDB() {
    try {
        const active = await ActiveNumber.find({ isActive: true });
        return active.map(a => a.sessionId);
    } catch (error) {
        console.error('❌ Error getting active numbers:', error);
        return [];
    }
}

// ====================================
// STATS FUNCTIONS
// ====================================

// Increment stats
async function incrementStats(sessionId, field) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        await Stats.findOneAndUpdate(
            { sessionId: sessionId, date: today },
            { $inc: { [field]: 1 } },
            { upsert: true, new: true }
        );
        return true;
    } catch (error) {
        console.error('❌ Error updating stats:', error);
        return false;
    }
}

// Get stats for session
async function getStatsForSession(sessionId, days = 7) {
    try {
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - days);
        const dateStr = dateLimit.toISOString().split('T')[0];
        
        const stats = await Stats.find({ 
            sessionId: sessionId,
            date: { $gte: dateStr }
        }).sort({ date: -1 });
        
        return stats;
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        return [];
    }
}

// ====================================
// GROUP SETTINGS FUNCTIONS
// ====================================

// Get or create group settings
async function getGroupSettingsFromDB(groupId) {
    try {
        let settings = await GroupSettings.findOne({ groupId: groupId });
        
        if (!settings) {
            settings = new GroupSettings({
                groupId: groupId,
                settings: {
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
                    autosticker: false
                }
            });
            await settings.save();
            console.log(`📝 Created default settings for group: ${groupId}`);
        }
        return settings;
    } catch (error) {
        console.error('❌ Error getting group settings:', error);
        return null;
    }
}

// Update group settings
async function updateGroupSettingsInDB(groupId, updates) {
    try {
        const settings = await GroupSettings.findOneAndUpdate(
            { groupId: groupId },
            { 
                $set: { [`settings.${Object.keys(updates)[0]}`]: Object.values(updates)[0] },
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
        return settings;
    } catch (error) {
        console.error('❌ Error updating group settings:', error);
        return null;
    }
}

// Toggle a setting
async function toggleGroupSetting(groupId, setting, value) {
    try {
        const settings = await GroupSettings.findOneAndUpdate(
            { groupId: groupId },
            { 
                $set: { [`settings.${setting}`]: value },
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
        return settings;
    } catch (error) {
        console.error(`❌ Error toggling ${setting}:`, error);
        return null;
    }
}

// ====================================
// WARNING FUNCTIONS
// ====================================

// Add warning to user
async function addWarningToDB(groupId, userId, reason, warnedBy = null) {
    try {
        let warning = await Warning.findOne({ groupId: groupId, userId: userId });
        
        if (!warning) {
            warning = new Warning({
                groupId: groupId,
                userId: userId,
                warnings: [],
                warningCount: 0
            });
        }
        
        warning.warnings.push({
            reason: reason,
            date: new Date(),
            warnedBy: warnedBy
        });
        warning.warningCount = warning.warnings.length;
        warning.updatedAt = new Date();
        
        await warning.save();
        return warning;
    } catch (error) {
        console.error('❌ Error adding warning:', error);
        return null;
    }
}

// Get user warnings
async function getWarningsFromDB(groupId, userId) {
    try {
        const warning = await Warning.findOne({ groupId: groupId, userId: userId });
        return warning || { warningCount: 0, warnings: [] };
    } catch (error) {
        console.error('❌ Error getting warnings:', error);
        return { warningCount: 0, warnings: [] };
    }
}

// Remove a warning
async function removeWarningFromDB(groupId, userId) {
    try {
        const warning = await Warning.findOne({ groupId: groupId, userId: userId });
        if (!warning) return false;
        
        if (warning.warnings.length > 0) {
            warning.warnings.pop();
            warning.warningCount = warning.warnings.length;
            warning.updatedAt = new Date();
            await warning.save();
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Error removing warning:', error);
        return false;
    }
}

// Clear all warnings
async function clearWarningsFromDB(groupId, userId) {
    try {
        await Warning.deleteOne({ groupId: groupId, userId: userId });
        return true;
    } catch (error) {
        console.error('❌ Error clearing warnings:', error);
        return false;
    }
}

// ====================================
// MUTE FUNCTIONS
// ====================================

// Mute user
async function muteUserInDB(groupId, userId, duration, reason = 'No reason', mutedBy = null) {
    try {
        const until = new Date(Date.now() + duration);
        
        await MutedUser.findOneAndUpdate(
            { groupId: groupId, userId: userId },
            { 
                until: until,
                reason: reason,
                mutedBy: mutedBy,
                createdAt: new Date()
            },
            { upsert: true, new: true }
        );
        return true;
    } catch (error) {
        console.error('❌ Error muting user:', error);
        return false;
    }
}

// Unmute user
async function unmuteUserInDB(groupId, userId) {
    try {
        await MutedUser.deleteOne({ groupId: groupId, userId: userId });
        return true;
    } catch (error) {
        console.error('❌ Error unmuting user:', error);
        return false;
    }
}

// Check if user is muted
async function isUserMutedInDB(groupId, userId) {
    try {
        const muted = await MutedUser.findOne({
            groupId: groupId,
            userId: userId,
            until: { $gt: new Date() }
        });
        return muted !== null;
    } catch (error) {
        console.error('❌ Error checking mute:', error);
        return false;
    }
}

// Get muted users
async function getMutedUsersInDB(groupId) {
    try {
        const muted = await MutedUser.find({
            groupId: groupId,
            until: { $gt: new Date() }
        });
        return muted;
    } catch (error) {
        console.error('❌ Error getting muted users:', error);
        return [];
    }
}

// ====================================
// ANTI-SPAM FUNCTIONS
// ====================================

// Track user messages for spam detection
async function trackMessageForSpam(groupId, userId) {
    try {
        const now = new Date();
        const resetTime = new Date(now.getTime() + 60000);
        
        let tracker = await SpamTracker.findOne({ groupId: groupId, userId: userId });
        
        if (!tracker) {
            tracker = new SpamTracker({
                groupId: groupId,
                userId: userId,
                messageCount: 1,
                firstMessageTime: now,
                lastMessageTime: now,
                resetTime: resetTime
            });
        } else {
            // Check if reset time has passed
            if (new Date() > tracker.resetTime) {
                tracker.messageCount = 1;
                tracker.firstMessageTime = now;
                tracker.resetTime = resetTime;
            } else {
                tracker.messageCount += 1;
            }
            tracker.lastMessageTime = now;
        }
        
        await tracker.save();
        return tracker.messageCount;
    } catch (error) {
        console.error('❌ Error tracking spam:', error);
        return 0;
    }
}

// ====================================
// EXPORTS
// ====================================

module.exports = {
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
    trackMessageForSpam,
    
    // Models (for advanced use)
    Session,
    UserConfig,
    Stats,
    PairingCode,
    ActiveNumber,
    GroupSettings,
    Warning,
    MutedUser,
    SpamTracker
};
