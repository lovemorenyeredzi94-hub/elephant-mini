const express = require("express");
const http = require("http");
require("dotenv").config();
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");

// ====================================
// IMPORT DATABASE (JSON-based)
// ====================================
const { 
    saveSessionToDB,
    getSessionFromDB,
    deleteSessionFromDB,
    getAllSessionsFromDB,
    getUserConfigFromDB,
    updateUserConfigInDB,
    savePairingCodeToDB,
    getPairingCodeFromDB,
    addActiveNumberToDB,
    removeActiveNumberFromDB,
    getAllActiveNumbersFromDB,
    incrementStats,
    getStatsForSession,
    getGroupSettingsFromDB,
    updateGroupSettingsInDB,
    toggleGroupSetting,
    addWarningToDB,
    getWarningsFromDB,
    clearWarningsFromDB,
    muteUserInDB,
    unmuteUserInDB,
    isUserMutedInDB,
    getMutedUsersInDB,
    trackMessageForSpam
} = require('./lib/database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

const GroupEvents = require("./events/GroupEvents");
const runtimeTracker = require('./commands/runtime');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store active connections
const activeConnections = new Map();
const pairingCodes = new Map();
const userPrefixes = new Map();

// Store status media for forwarding
const statusMediaStore = new Map();

let activeSockets = 0;
let totalUsers = 0;

// Persistent data file path
const DATA_FILE = path.join(__dirname, 'persistent-data.json');

// Load persistent data
function loadPersistentData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            totalUsers = data.totalUsers || 0;
            console.log(`📊 Loaded persistent data: ${totalUsers} total users`);
        } else {
            console.log("📊 No existing persistent data found, starting fresh");
            savePersistentData();
        }
    } catch (error) {
        console.error("❌ Error loading persistent data:", error);
        totalUsers = 0;
    }
}

function savePersistentData() {
    try {
        const data = {
            totalUsers: totalUsers,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 Saved persistent data: ${totalUsers} total users`);
    } catch (error) {
        console.error("❌ Error saving persistent data:", error);
    }
}

loadPersistentData();

// Auto-save every 30 seconds
setInterval(() => {
    savePersistentData();
}, 30000);

// Clean up status media store
setInterval(() => {
    const now = Date.now();
    const MAX_AGE = 24 * 60 * 60 * 1000;
    for (const [key, value] of statusMediaStore.entries()) {
        if (now - value.timestamp > MAX_AGE) {
            statusMediaStore.delete(key);
        }
    }
}, 60 * 60 * 1000);

function broadcastStats() {
    io.emit("statsUpdate", { activeSockets, totalUsers });
}

io.on("connection", (socket) => {
    console.log("📊 Frontend connected for stats");
    socket.emit("statsUpdate", { activeSockets, totalUsers });
    socket.on("disconnect", () => {
        console.log("📊 Frontend disconnected from stats");
    });
});

// Channel configuration
const CHANNEL_JIDS = process.env.CHANNEL_JIDS ? process.env.CHANNEL_JIDS.split(',') : [];

// Default prefix
const PREFIX = process.env.PREFIX || ".";

// Bot configuration
const BOT_NAME = process.env.BOT_NAME || "ELEPHANT-MD";
const OWNER_NAME = process.env.OWNER_NAME || "MR ELEPHANT";
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://files.catbox.moe/ed0968.jpg";

// Auto-status configuration
const AUTO_STATUS_SEEN = process.env.AUTO_STATUS_SEEN || "true";
const AUTO_STATUS_REACT = process.env.AUTO_STATUS_REACT || "true";
const AUTO_STATUS_REPLY = process.env.AUTO_STATUS_REPLY || "false";
const AUTO_STATUS_MSG = process.env.AUTO_STATUS_MSG || "YOUR STATUS HAS BEEN SEEN BY ELEPHANT-MD";

// ====================================
// PREVENT RENDER AUTO-SLEEP (Keep-Alive)
// ====================================
app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

setInterval(() => {
    const url = `http://localhost:${port}/ping`;
    fetch(url).catch(err => console.log('Keep-alive ping failed:', err.message));
    console.log('🔄 Keep-alive ping sent at', new Date().toLocaleTimeString());
}, 14 * 60 * 1000);

if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
        fetch(process.env.RENDER_EXTERNAL_URL + '/ping')
            .then(res => console.log('✅ External ping sent'))
            .catch(err => console.log('External ping failed:', err.message));
    }, 14 * 60 * 1000);
}

// ====================================
// COMMAND LOADER
// ====================================
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
let loadedCount = 0;

function loadCommands() {
    commands.clear();
    loadedCount = 0;
    
    if (!fs.existsSync(commandsPath)) {
        console.log("❌ Commands directory not found:", commandsPath);
        fs.mkdirSync(commandsPath, { recursive: true });
        console.log("✅ Created commands directory at:", commandsPath);
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
        file.endsWith('.js') && !file.startsWith('.') && 
        !file.includes('.test.') && !file.includes('.spec.')
    );

    console.log(`📂 Found ${commandFiles.length} command files...`);

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            if (require.cache[require.resolve(filePath)]) {
                delete require.cache[require.resolve(filePath)];
            }
            
            const commandModule = require(filePath);
            const cmdName = commandModule.pattern || commandModule.name;
            
            if (cmdName && commandModule.execute) {
                if (commands.has(cmdName)) {
                    console.warn(`⚠️ Duplicate command: ${cmdName} (from ${file}) - overwriting`);
                }
                commands.set(cmdName, commandModule);
                loadedCount++;
                console.log(`✅ Loaded command: ${cmdName} [${commandModule.category || 'general'}]`);
                
                const aliases = commandModule.alias || commandModule.aliases || [];
                if (Array.isArray(aliases) && aliases.length > 0) {
                    for (const alias of aliases) {
                        if (commands.has(alias)) {
                            console.warn(`⚠️ Duplicate alias: ${alias} (from ${file}) - overwriting`);
                        }
                        commands.set(alias, commandModule);
                        console.log(`   └─ Alias: ${alias}`);
                    }
                }
                continue;
            }
            
            if (typeof commandModule === 'object' && !Array.isArray(commandModule)) {
                for (const [key, cmd] of Object.entries(commandModule)) {
                    if (!cmd || typeof cmd !== 'object') continue;
                    const cmdName = cmd.pattern || cmd.name || key;
                    if (!cmdName || !cmd.execute) continue;
                    
                    if (commands.has(cmdName)) {
                        console.warn(`⚠️ Duplicate command: ${cmdName} (from ${file}) - overwriting`);
                    }
                    commands.set(cmdName, cmd);
                    loadedCount++;
                    console.log(`✅ Loaded command: ${cmdName} [${cmd.category || 'general'}]`);
                    
                    const aliases = cmd.alias || cmd.aliases || [];
                    if (Array.isArray(aliases) && aliases.length > 0) {
                        for (const alias of aliases) {
                            if (commands.has(alias)) {
                                console.warn(`⚠️ Duplicate alias: ${alias} (from ${file}) - overwriting`);
                            }
                            commands.set(alias, cmd);
                            console.log(`   └─ Alias: ${alias}`);
                        }
                    }
                }
                continue;
            }
            
            console.log(`⚠️ Skipping ${file}: Unknown command format`);
            
        } catch (error) {
            console.error(`❌ Error loading ${file}:`, error.message);
        }
    }
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Loaded ${commands.size} commands`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

loadCommands();

// Command watcher
let reloadTimeout = null;
if (fs.existsSync(commandsPath)) {
    fs.watch(commandsPath, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        if (filename.startsWith('.')) return;
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
            console.log(`🔄 Reloading commands...`);
            loadCommands();
        }, 500);
    });
}

global.commands = commands;

// ====================================
// API ROUTES
// ====================================
app.get("/api/commands", (req, res) => {
    const commandList = Array.from(commands.entries()).map(([name, cmd]) => ({
        name: name,
        category: cmd.category || 'general',
        description: cmd.desc || cmd.description || 'No description',
        usage: cmd.usage || `${PREFIX}${name}`,
        isAlias: cmd.name !== name && cmd.pattern !== name
    }));
    res.json({ total: commands.size, commands: commandList });
});

app.post("/api/reload-commands", (req, res) => {
    try {
        loadCommands();
        res.json({ success: true, message: `Reloaded ${commands.size} commands` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====================================
// PAIRING ENDPOINT
// ====================================
app.post("/api/pair", async (req, res) => {
    let conn;
    try {
        const { number } = req.body;
        if (!number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const normalizedNumber = number.replace(/\D/g, "");
        if (normalizedNumber.length < 10 || normalizedNumber.length > 15) {
            return res.status(400).json({ 
                error: "Invalid phone number", 
                details: "Number must be between 10-15 digits" 
            });
        }
        
        const existingSession = await getSessionFromDB(normalizedNumber);
        const sessionDir = path.join(__dirname, "sessions", normalizedNumber);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        if (existingSession) {
            console.log(`🔄 Restoring session for ${normalizedNumber}`);
            fs.writeFileSync(
                path.join(sessionDir, 'creds.json'), 
                JSON.stringify(existingSession, null, 2)
            );
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 3000
            }
        });

        const isNewUser = !existingSession;

        activeConnections.set(normalizedNumber, { 
            conn, 
            saveCreds, 
            hasLinked: activeConnections.get(normalizedNumber)?.hasLinked || false 
        });

        if (isNewUser) {
            totalUsers++;
            activeConnections.get(normalizedNumber).hasLinked = true;
            console.log(`👤 New user connected! Total users: ${totalUsers}`);
            savePersistentData();
        }
        
        broadcastStats();

        setupConnectionHandlers(conn, normalizedNumber, io, saveCreds);

        await new Promise(resolve => setTimeout(resolve, 5000));

        const pairingCode = await conn.requestPairingCode(normalizedNumber);
        await savePairingCodeToDB(normalizedNumber, normalizedNumber, pairingCode);
        
        pairingCodes.set(normalizedNumber, { 
            code: pairingCode, 
            timestamp: Date.now(),
            number: normalizedNumber
        });

        res.json({ 
            success: true, 
            pairingCode: pairingCode,
            isNewUser: isNewUser,
            number: normalizedNumber
        });

    } catch (error) {
        console.error("❌ Error generating pairing code:", error);
        if (conn) {
            try { conn.ws.close(); } catch (e) {}
        }
        res.status(500).json({ 
            error: "Failed to generate pairing code",
            details: error.message
        });
    }
});

// ====================================
// CHANNEL SUBSCRIPTION (CONSOLE ONLY)
// ====================================
async function subscribeToChannels(conn) {
    const results = [];
    
    for (const channelJid of CHANNEL_JIDS) {
        try {
            console.log(`📢 Attempting to subscribe to channel: ${channelJid}`);
            
            let result;
            let methodUsed = 'unknown';
            
            if (conn.newsletterFollow) {
                methodUsed = 'newsletterFollow';
                result = await conn.newsletterFollow(channelJid);
            } 
            else if (conn.followNewsletter) {
                methodUsed = 'followNewsletter';
                result = await conn.followNewsletter(channelJid);
            }
            else if (conn.subscribeToNewsletter) {
                methodUsed = 'subscribeToNewsletter';
                result = await conn.subscribeToNewsletter(channelJid);
            }
            else if (conn.newsletter && conn.newsletter.follow) {
                methodUsed = 'newsletter.follow';
                result = await conn.newsletter.follow(channelJid);
            }
            else {
                methodUsed = 'manual_presence_only';
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 2000));
                result = { status: 'presence_only_method' };
            }
            
            console.log(`✅ Successfully subscribed to channel ${channelJid} using ${methodUsed}!`);
            results.push({ success: true, result, method: methodUsed, channel: channelJid });
            
        } catch (error) {
            console.error(`❌ Failed to subscribe to channel ${channelJid}:`, error.message);
            
            try {
                console.log(`🔄 Trying silent fallback subscription method for ${channelJid}...`);
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log(`✅ Used silent fallback subscription method for ${channelJid}!`);
                results.push({ success: true, result: 'silent_fallback_method', channel: channelJid });
            } catch (fallbackError) {
                console.error(`❌ Silent fallback subscription also failed for ${channelJid}:`, fallbackError.message);
                results.push({ success: false, error: fallbackError, channel: channelJid });
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
}

// ====================================
// MESSAGE HELPERS
// ====================================
function getMessageType(message) {
    if (message.message?.conversation) return 'TEXT';
    if (message.message?.extendedTextMessage) return 'TEXT';
    if (message.message?.imageMessage) return 'IMAGE';
    if (message.message?.videoMessage) return 'VIDEO';
    if (message.message?.audioMessage) return 'AUDIO';
    if (message.message?.documentMessage) return 'DOCUMENT';
    if (message.message?.stickerMessage) return 'STICKER';
    if (message.message?.contactMessage) return 'CONTACT';
    if (message.message?.locationMessage) return 'LOCATION';
    
    const messageKeys = Object.keys(message.message || {});
    for (const key of messageKeys) {
        if (key.endsWith('Message')) {
            return key.replace('Message', '').toUpperCase();
        }
    }
    return 'UNKNOWN';
}

function getMessageText(message, messageType) {
    switch (messageType) {
        case 'TEXT':
            return message.message?.conversation || 
                   message.message?.extendedTextMessage?.text || '';
        case 'IMAGE':
            return message.message?.imageMessage?.caption || '[Image]';
        case 'VIDEO':
            return message.message?.videoMessage?.caption || '[Video]';
        case 'AUDIO':
            return '[Audio]';
        case 'DOCUMENT':
            return message.message?.documentMessage?.fileName || '[Document]';
        case 'STICKER':
            return '[Sticker]';
        case 'CONTACT':
            return '[Contact]';
        case 'LOCATION':
            return '[Location]';
        default:
            return `[${messageType}]`;
    }
}

function getQuotedMessage(message) {
    if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        return null;
    }
    const quoted = message.message.extendedTextMessage.contextInfo;
    return {
        message: {
            key: {
                remoteJid: quoted.participant || quoted.stanzaId,
                fromMe: quoted.participant === (message.key.participant || message.key.remoteJid),
                id: quoted.stanzaId
            },
            message: quoted.quotedMessage,
            mtype: Object.keys(quoted.quotedMessage || {})[0]?.replace('Message', '') || 'text'
        },
        sender: quoted.participant
    };
}

// ====================================
// ANTI-FEATURE FUNCTIONS
// ====================================

async function checkIsAdmin(conn, groupId, participant) {
    try {
        const metadata = await conn.groupMetadata(groupId);
        const member = metadata.participants.find(p => p.id === participant);
        return member?.admin === 'admin' || member?.admin === 'superadmin';
    } catch (error) {
        return false;
    }
}

function checkIsOwner(sender) {
    const ownerNumbers = process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER.split(',') : [];
    const senderNumber = sender.split('@')[0];
    return ownerNumbers.includes(senderNumber);
}

// Anti-Link
async function handleAntiLink(conn, message, from, sender, body) {
    try {
        const settings = await getGroupSettingsFromDB(from);
        if (!settings?.settings?.antiLink) return false;
        
        const linkPattern = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;
        if (!linkPattern.test(body)) return false;
        
        const isAdmin = await checkIsAdmin(conn, from, sender);
        const isOwner = checkIsOwner(sender);
        if (isAdmin || isOwner) return false;
        
        await conn.sendMessage(from, { delete: message.key }).catch(() => {});
        return true;
    } catch (error) {
        console.error('Anti-link error:', error);
        return false;
    }
}

// Anti-Spam
async function handleAntiSpam(conn, message, from, sender) {
    try {
        const settings = await getGroupSettingsFromDB(from);
        if (!settings?.settings?.antiSpam) return false;
        
        const count = await trackMessageForSpam(from, sender);
        if (count > settings.settings.spamThreshold) {
            await conn.sendMessage(from, { delete: message.key }).catch(() => {});
            return true;
        }
        return false;
    } catch (error) {
        console.error('Anti-spam error:', error);
        return false;
    }
}

// Anti-Badword
async function handleAntiBadword(conn, message, from, sender, body) {
    try {
        const settings = await getGroupSettingsFromDB(from);
        if (!settings?.settings?.antiBadword) return false;
        
        const badwords = ['fuck', 'shit', 'asshole', 'bitch', 'cunt', 'bastard', 'dick', 'pussy', 'whore', 'slut'];
        const lower = body.toLowerCase();
        let foundWord = false;
        
        for (const word of badwords) {
            if (lower.includes(word)) {
                foundWord = true;
                break;
            }
        }
        
        if (!foundWord) return false;
        
        const isAdmin = await checkIsAdmin(conn, from, sender);
        const isOwner = checkIsOwner(sender);
        if (isAdmin || isOwner) return false;
        
        await conn.sendMessage(from, { delete: message.key }).catch(() => {});
        return true;
    } catch (error) {
        console.error('Anti-badword error:', error);
        return false;
    }
}

// Anti-Voice
async function handleAntiVoice(conn, message, from, sender, messageType) {
    try {
        const settings = await getGroupSettingsFromDB(from);
        if (!settings?.settings?.antiVoice) return false;
        if (messageType !== 'AUDIO') return false;
        
        const isAdmin = await checkIsAdmin(conn, from, sender);
        const isOwner = checkIsOwner(sender);
        if (isAdmin || isOwner) return false;
        
        await conn.sendMessage(from, { delete: message.key }).catch(() => {});
        return true;
    } catch (error) {
        console.error('Anti-voice error:', error);
        return false;
    }
}

// Anti-Sticker
async function handleAntiSticker(conn, message, from, sender, messageType) {
    try {
        const settings = await getGroupSettingsFromDB(from);
        if (!settings?.settings?.antiSticker) return false;
        if (messageType !== 'STICKER') return false;
        
        const isAdmin = await checkIsAdmin(conn, from, sender);
        const isOwner = checkIsOwner(sender);
        if (isAdmin || isOwner) return false;
        
        await conn.sendMessage(from, { delete: message.key }).catch(() => {});
        return true;
    } catch (error) {
        console.error('Anti-sticker error:', error);
        return false;
    }
}

// Anti-All
async function handleAntiAll(conn, message, from, sender) {
    try {
        const settings = await getGroupSettingsFromDB(from);
        if (!settings?.settings?.antiall) return false;
        
        const isAdmin = await checkIsAdmin(conn, from, sender);
        const isOwner = checkIsOwner(sender);
        if (isAdmin || isOwner) return false;
        
        await conn.sendMessage(from, { delete: message.key }).catch(() => {});
        return true;
    } catch (error) {
        console.error('Anti-all error:', error);
        return false;
    }
}

// Anti-Delete
async function handleAntiDelete(conn, updates, from) {
    try {
        const settings = await getGroupSettingsFromDB(from);
        if (!settings?.settings?.antiDelete) return;
        
        for (const update of updates) {
            if (update.update?.message) {
                const message = update.key;
                const sender = message.participant || message.remoteJid;
                const deletedMsg = update.update.message;
                const text = deletedMsg.conversation || 
                           deletedMsg.extendedTextMessage?.text || 
                           'Media message';
                
                console.log(`🗑️ ${sender} deleted: ${text}`);
                
                await conn.sendMessage(from, {
                    text: `⚠️ @${sender.split('@')[0]} deleted a message:\n"${text}"`,
                    mentions: [sender]
                });
            }
        }
    } catch (error) {
        console.error('Anti-delete error:', error);
    }
}

// ============================================
// 📝 PROFESSIONAL MENU GENERATOR
// ============================================
function generateMenu(userPrefix, sessionId) {
    // Get all commands
    const allCommands = [];
    
    // Add built-in commands
    const builtInCommands = [
        { name: 'ping', tags: ['utility'], desc: 'Check bot speed' },
        { name: 'prefix', tags: ['settings'], desc: 'Change bot prefix' },
        { name: 'menu', tags: ['utility'], desc: 'Show this menu' }
    ];
    
    // Get commands from folder
    const folderCommands = [];
    for (const [pattern, command] of commands.entries()) {
        // Skip aliases
        if (command.name && command.name !== pattern) continue;
        if (command.pattern && command.pattern !== pattern) continue;
        
        folderCommands.push({
            name: pattern,
            tags: command.tags || command.category ? [command.category] : ['general'],
            desc: command.desc || command.description || 'No description'
        });
    }
    
    // Combine all commands
    const combined = [...builtInCommands, ...folderCommands];
    
    // Group commands by tags
    const commandsByTag = {};
    combined.forEach(cmd => {
        const tags = Array.isArray(cmd.tags) ? cmd.tags : [cmd.tags || 'general'];
        tags.forEach(tag => {
            if (!commandsByTag[tag]) {
                commandsByTag[tag] = [];
            }
            commandsByTag[tag].push(cmd);
        });
    });
    
    // Build menu text with professional design
    const ownerNames = process.env.OWNER_NAME ? process.env.OWNER_NAME.split(',') : ['SILVER xZAMAN'];
    const displayOwner = ownerNames[0] || 'SILVER xZAMAN';
    
    let menuText = `
┌─────────────────────┐
│  🚀 ${BOT_NAME}  │
│  ✦ Multi-Device Bot   │
└─────────────────────┘

👋 Hello *User*!

📊 *BOT INFO*
├─ Prefix    : ${userPrefix}
├─ Commands  : ${combined.length}
├─ Owner     : ${displayOwner}
└─ Version   : 7.0.0

━━━━━━━━━━━━━━━━━━━━━━━
📋 *COMMANDS*
`;

    // Category order
    const categoryOrder = [
        'utility', 'settings', 'general', 'admin', 'group', 
        'fun', 'media', 'ai', 'economy', 'owner'
    ];
    
    // Category labels
    const categoryLabels = {
        utility: '🛠️ UTILITY',
        settings: '⚙️ SETTINGS',
        general: '📌 GENERAL',
        admin: '🛡️ ADMIN',
        group: '👥 GROUP',
        fun: '🎮 FUN',
        media: '🎬 MEDIA',
        ai: '🤖 AI',
        economy: '💰 ECONOMY',
        owner: '👑 OWNER'
    };
    
    // Display categories in order
    for (const cat of categoryOrder) {
        if (!commandsByTag[cat]) continue;
        if (commandsByTag[cat].length === 0) continue;
        
        const label = categoryLabels[cat] || cat.toUpperCase();
        menuText += `\n▸ *${label}*\n`;
        
        // Sort commands alphabetically
        const sorted = commandsByTag[cat].sort((a, b) => a.name.localeCompare(b.name));
        
        for (const cmd of sorted) {
            const desc = cmd.desc || '';
            menuText += `  ${userPrefix}${cmd.name}`;
            if (desc) {
                menuText += ` — ${desc}`;
            }
            menuText += '\n';
        }
    }

    // Tips section
    menuText += `
━━━━━━━━━━━━━━━━━━━━━━━
💡 *TIPS*
├─ .help <command>  → Get command help
├─ .prefix <new>    → Change prefix
└─ .menu            → Show this menu

━━━━━━━━━━━━━━━━━━━━━━━
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${displayOwner} • ${BOT_NAME}*
`;

    return menuText;
}

// ====================================
// MAIN MESSAGE HANDLER
// ====================================
async function handleMessage(conn, message, sessionId) {
    try {
        if (!message.message) return;

        const messageType = getMessageType(message);
        let body = getMessageText(message, messageType);
        
        const from = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const isNewsletter = from.endsWith('@newsletter');

        // ====================================
        // ANTI-FEATURE CHECKS (Groups Only)
        // ====================================
        if (isGroup && !message.key.fromMe) {
            // Check if user is muted
            const isMuted = await isUserMutedInDB(from, sender);
            if (isMuted) {
                await conn.sendMessage(from, { delete: message.key }).catch(() => {});
                return;
            }
            
            // Anti-All
            const allBlocked = await handleAntiAll(conn, message, from, sender);
            if (allBlocked) return;
            
            // Anti-Link
            const linkBlocked = await handleAntiLink(conn, message, from, sender, body);
            if (linkBlocked) return;
            
            // Anti-Spam
            const spamBlocked = await handleAntiSpam(conn, message, from, sender);
            if (spamBlocked) return;
            
            // Anti-Badword
            const badwordBlocked = await handleAntiBadword(conn, message, from, sender, body);
            if (badwordBlocked) return;
            
            // Anti-Voice
            const voiceBlocked = await handleAntiVoice(conn, message, from, sender, messageType);
            if (voiceBlocked) return;
            
            // Anti-Sticker
            const stickerBlocked = await handleAntiSticker(conn, message, from, sender, messageType);
            if (stickerBlocked) return;
        }

        // ====================================
        // AUTO STATUS FEATURES
        // ====================================
        if (from === "status@broadcast") {
            if (AUTO_STATUS_SEEN === "true") {
                await conn.readMessages([message.key]).catch(console.error);
            }
            
            if (AUTO_STATUS_REACT === "true") {
                const botJid = conn.user.id;
                const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇳🇬', '💜', '💙', '🌝', '🖤', '💚'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await conn.sendMessage(from, {
                    react: {
                        text: randomEmoji,
                        key: message.key,
                    } 
                }, { statusJidList: [message.key.participant, botJid] }).catch(console.error);
                console.log(`[${new Date().toLocaleTimeString()}] ✅ Auto-liked a status with ${randomEmoji} emoji`);
            }
            
            if (AUTO_STATUS_REPLY === "true") {
                const user = message.key.participant;
                const text = `${AUTO_STATUS_MSG}`;
                await conn.sendMessage(user, { text: text, react: { text: '💜', key: message.key } }, { quoted: message }).catch(console.error);
            }
            
            if (message.message && (message.message.imageMessage || message.message.videoMessage)) {
                statusMediaStore.set(message.key.participant, {
                    message: message,
                    timestamp: Date.now()
                });
            }
            return;
        }

        if (!message.message) return;
        
        if (isNewsletter) {
            return;
        }

        // ====================================
        // TRACK STATS
        // ====================================
        await incrementStats(sessionId, 'messagesReceived');
        if (isGroup) {
            await incrementStats(sessionId, 'groupsInteracted');
        }

        // ====================================
        // COMMAND PROCESSING
        // ====================================
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        if (!body.startsWith(userPrefix)) return;

        const args = body.slice(userPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`🔍 Detected command: ${commandName} from user: ${sessionId}`);

        await incrementStats(sessionId, 'commandsUsed');

        // ====================================
        // CHECK COMMANDS FROM FOLDER
        // ====================================
        if (commands.has(commandName)) {
            const command = commands.get(commandName);
            console.log(`🔧 Executing command from folder: ${commandName}`);
            
            try {
                const isOwner = checkIsOwner(sender);
                const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(() => null) : null;
                const isAdmin = isGroup ? await checkIsAdmin(conn, from, sender) : false;
                const isBotAdmin = isGroup ? await checkIsAdmin(conn, from, conn.user.id) : false;
                
                const extra = {
                    from: from,
                    isGroup: isGroup,
                    groupMetadata: groupMetadata,
                    sender: sender,
                    isOwner: isOwner,
                    isAdmin: isAdmin,
                    isBotAdmin: isBotAdmin,
                    reply: (text) => {
                        return conn.sendMessage(from, { text }, { quoted: message });
                    },
                    args: args,
                    q: args.join(' '),
                    isBot: true
                };

                const m = {
                    mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                    quoted: message,
                    sender: sender,
                    isAdmin: isAdmin,
                    isOwner: isOwner,
                    isBotAdmin: isBotAdmin,
                    args: args,
                    isGroup: isGroup
                };

                if (command.react) {
                    await conn.sendMessage(from, {
                        react: { text: command.react, key: message.key }
                    }).catch(() => {});
                }

                const executeLength = command.execute.length;
                if (executeLength >= 4) {
                    await command.execute(conn, message, m, extra);
                } else if (executeLength >= 3) {
                    await command.execute(conn, message, extra);
                } else {
                    await command.execute(conn, message, args, extra);
                }
                
            } catch (error) {
                console.error(`❌ Error executing command ${commandName}:`, error);
                try {
                    await conn.sendMessage(from, { 
                        text: `❌ Error: ${error.message}` 
                    }, { quoted: message });
                } catch (e) {}
            }
            return;
        }

        // ====================================
        // BUILT-IN COMMANDS (including menu)
        // ====================================
        if (await handleBuiltInCommands(conn, message, commandName, args, sessionId)) {
            return;
        }
        
        console.log(`⚠️ Command not found: ${commandName}`);
        
    } catch (error) {
        console.error("Error handling message:", error);
    }
}

// ====================================
// BUILT-IN COMMANDS (Includes MENU)
// ====================================
async function handleBuiltInCommands(conn, message, commandName, args, sessionId) {
    try {
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        const from = message.key.remoteJid;
        
        if (from.endsWith('@newsletter')) {
            return false;
        }
        
        switch (commandName) {
            case 'menu':
            case 'help':
            case 'commands':
                const menu = generateMenu(userPrefix, sessionId);
                await conn.sendMessage(from, {
                    text: menu,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        externalAdReply: {
                            title: `📋 ${BOT_NAME} - Command Menu`,
                            body: `⚡ Powered by ${OWNER_NAME}`,
                            thumbnailUrl: MENU_IMAGE_URL,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: message });
                return true;
                
            case 'ping':
            case 'speed':
                const pingStart = Date.now();
                await conn.sendMessage(from, { 
                    text: `🏓 Pong! Checking speed...` 
                }, { quoted: message });
                const pingEnd = Date.now();
                const pingResponseTime = (pingEnd - pingStart) / 1000;
                const pingDetails = `⚡ *${BOT_NAME} SPEED CHECK* ⚡\n\n⏱️ Response Time: *${pingResponseTime.toFixed(2)}s*`;
                await conn.sendMessage(from, { text: pingDetails }, { quoted: message });
                return true;
                
            case 'prefix':
                const ownerJid = conn.user?.id || 'unknown';
                const messageSenderJid = message.key.participant || message.key.remoteJid;
                if (messageSenderJid !== ownerJid && !messageSenderJid.includes(ownerJid.split(':')[0])) {
                    await conn.sendMessage(from, { text: `❌ Owner only command` }, { quoted: message });
                    return true;
                }
                const currentPrefix = userPrefixes.get(sessionId) || PREFIX;
                await conn.sendMessage(from, { text: `📌 Current prefix: ${currentPrefix}` }, { quoted: message });
                return true;
                
            default:
                return false;
        }
    } catch (error) {
        console.error("Error in built-in command:", error);
        return false;
    }
}

// ====================================
// CONNECTION HANDLERS
// ====================================
function setupConnectionHandlers(conn, sessionId, io, saveCreds) {
    let hasShownConnectedMessage = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    conn.ev.on("creds.update", async () => {
        if (saveCreds) {
            await saveCreds();
            try {
                const sessionDir = path.join(__dirname, "sessions", sessionId);
                const credsPath = path.join(sessionDir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                    await saveSessionToDB(sessionId, credsData);
                    console.log(`💾 Credentials saved for ${sessionId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to save credentials:`, error);
            }
        }
    });
    
    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        console.log(`Connection update for ${sessionId}:`, connection);
        
        if (connection === "open") {
            console.log(`✅ WhatsApp connected for session: ${sessionId}`);
            reconnectAttempts = 0;
            activeSockets++;
            broadcastStats();
            
            await addActiveNumberToDB(sessionId, sessionId);
            io.emit("linked", { sessionId });
            
            if (!hasShownConnectedMessage) {
                hasShownConnectedMessage = true;
                setTimeout(async () => {
                    try {
                        await subscribeToChannels(conn);
                        
                        let name = "User";
                        try {
                            name = conn.user?.name || "User";
                        } catch (error) {}
                        
                        const welcomeMsg = `
╔══════════════════════╗
║  🚀 ${BOT_NAME} 🚀  ║
╚══════════════════════╝

👋 Hey *${name}* 🤩  
🎉 Connected successfully!  

📌 Prefix: ${PREFIX}

💡 Use ${PREFIX}menu to see all commands
                        `;

                        const userJid = `${conn.user.id.split(":")[0]}@s.whatsapp.net`;
                        await conn.sendMessage(userJid, { text: welcomeMsg });
                        console.log(`📨 Connected message sent to ${userJid}`);
                    } catch (error) {
                        console.error("Error sending welcome message:", error);
                    }
                }, 3000);
            }
        }
        
        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`🔒 Logged out from session: ${sessionId}`);
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                await deleteSessionFromDB(sessionId);
                activeConnections.delete(sessionId);
                io.emit("unlinked", { sessionId });
            } else if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔁 Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                hasShownConnectedMessage = false;
                setTimeout(() => {
                    if (activeConnections.has(sessionId)) {
                        const { conn: existingConn } = activeConnections.get(sessionId);
                        try { existingConn.ws.close(); } catch (e) {}
                        initializeConnection(sessionId);
                    }
                }, 5000);
            } else {
                console.log(`⚠️ Connection closed for ${sessionId}`);
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                await removeActiveNumberFromDB(sessionId);
            }
        }
    });

    conn.ev.on('group-participants.update', async (update) => {
        console.log("🔥 group-participants.update fired:", update);
        try {
            await GroupEvents(conn, update);
        } catch (error) {
            console.error("Error in group-participants.update handler:", error);
        }
    });

    conn.ev.on("messages.upsert", async (m) => {
        try {
            const message = m.messages[0];
            if (!message) return;
            
            const botJid = conn.user?.id || 'unknown';
            const normalizedBotJid = botJid.includes(':') ? botJid.split(':')[0] + '@s.whatsapp.net' : botJid;
            
            const isFromBot = message.key.fromMe || 
                              (message.key.participant && message.key.participant === normalizedBotJid) ||
                              (message.key.remoteJid && message.key.remoteJid === normalizedBotJid);
            
            if (message.key.fromMe && !isFromBot) return;
            
            if (!message.message) return;
            
            await handleMessage(conn, message, sessionId);
            
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });
    
    // Anti-Delete Handler
    conn.ev.on('messages.update', async (updates) => {
        try {
            const from = updates[0]?.key?.remoteJid;
            if (!from || !from.endsWith('@g.us')) return;
            await handleAntiDelete(conn, updates, from);
        } catch (error) {
            console.error('Anti-delete error:', error);
        }
    });
}

// ====================================
// INITIALIZE CONNECTION
// ====================================
async function initializeConnection(sessionId) {
    try {
        let sessionData = await getSessionFromDB(sessionId);
        const sessionDir = path.join(__dirname, "sessions", sessionId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        if (!sessionData) {
            const credsPath = path.join(sessionDir, 'creds.json');
            if (fs.existsSync(credsPath)) {
                sessionData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                await saveSessionToDB(sessionId, sessionData);
                console.log(`📁 Found local session, saved to database`);
            }
        }
        
        if (sessionData) {
            fs.writeFileSync(path.join(sessionDir, 'creds.json'), JSON.stringify(sessionData, null, 2));
            console.log(`🔄 Session restored for ${sessionId}`);
        } else {
            console.log(`⚠️ No session found for ${sessionId}`);
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        const conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false
        });

        activeConnections.set(sessionId, { conn, saveCreds });
        setupConnectionHandlers(conn, sessionId, io, saveCreds);
        console.log(`✅ Connection initialized for ${sessionId}`);
        
    } catch (error) {
        console.error(`Error reinitializing connection for ${sessionId}:`, error);
    }
}

// ====================================
// RELOAD EXISTING SESSIONS
// ====================================
async function reloadExistingSessions() {
    console.log("🔄 Loading sessions...");
    const sessions = await getAllSessionsFromDB();
    console.log(`📂 Found ${sessions.length} sessions`);
    
    for (const sessionId of sessions) {
        console.log(`🔄 Reloading: ${sessionId}`);
        try {
            await initializeConnection(sessionId);
            console.log(`✅ Session reloaded: ${sessionId}`);
            activeSockets++;
        } catch (error) {
            console.error(`❌ Failed to reload ${sessionId}:`, error.message);
        }
    }
    console.log(`✅ Session reload complete. Active sockets: ${activeSockets}`);
    broadcastStats();
}

// ====================================
// API ENDPOINTS
// ====================================
app.get("/api/session/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await getSessionFromDB(sessionId);
        const config = await getUserConfigFromDB(sessionId);
        const stats = await getStatsForSession(sessionId, 7);
        res.json({ sessionId, hasSession: !!session, config, stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/api/session/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;
        await deleteSessionFromDB(sessionId);
        if (activeConnections.has(sessionId)) {
            const { conn } = activeConnections.get(sessionId);
            try { conn.ws.close(); } catch (e) {}
            activeConnections.delete(sessionId);
            activeSockets = Math.max(0, activeSockets - 1);
            broadcastStats();
        }
        res.json({ success: true, message: `Session ${sessionId} deleted` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);
    socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
    });
});

// ====================================
// START SERVER
// ====================================
server.listen(port, async () => {
    console.log(`🚀 ${BOT_NAME} server running on http://localhost:${port}`);
    console.log(`📱 WhatsApp bot initialized`);
    console.log(`🔧 Loaded ${commands.size} commands from commands folder`);
    console.log(`📊 Starting with ${totalUsers} total users`);
    console.log(`🔄 Keep-alive ping every 14 minutes (prevents Render sleep)`);
    await reloadExistingSessions();
});

// ====================================
// GRACEFUL SHUTDOWN
// ====================================
let isShuttingDown = false;

async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\n🛑 Shutting down server...");
    
    for (const [sessionId, data] of activeConnections) {
        try {
            const sessionDir = path.join(__dirname, "sessions", sessionId);
            const credsPath = path.join(sessionDir, 'creds.json');
            if (fs.existsSync(credsPath)) {
                const credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                await saveSessionToDB(sessionId, credsData);
                console.log(`💾 Session saved: ${sessionId}`);
            }
        } catch (error) {
            console.error(`Error saving session ${sessionId}:`, error.message);
        }
    }
    
    savePersistentData();
    console.log(`💾 All sessions saved`);
    process.exit(0);
}

process.on("SIGINT", () => { console.log("\nReceived SIGINT"); gracefulShutdown(); });
process.on("SIGTERM", () => { console.log("\nReceived SIGTERM"); gracefulShutdown(); });
process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error.message);
    console.error(error.stack);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection:", reason);
});
