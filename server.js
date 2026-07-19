const express = require("express");
const http = require("http");
require("dotenv").config();
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");

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
const CHANNEL_JIDS = process.env.CHANNEL_JIDS ? process.env.CHANNEL_JIDS.split(',') : [
    "120363422074850441@newsletter",
    "120363175198818522@newsletter",
];

// Default prefix
const PREFIX = process.env.PREFIX || ".";

// Bot configuration
const BOT_NAME = "ELEPHANT-MD";
const OWNER_NAME = "Mr Elephant";
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://up6.cc/2026/04/177631893622821.jpg";

// Auto-status configuration
const AUTO_STATUS_SEEN = process.env.AUTO_STATUS_SEEN || "true";
const AUTO_STATUS_REACT = process.env.AUTO_STATUS_REACT || "true";
const AUTO_STATUS_REPLY = process.env.AUTO_STATUS_REPLY || "false";
const AUTO_STATUS_MSG = process.env.AUTO_STATUS_MSG || "YOUR STATUS HAS BEEN SEEN BY ELEPHANT-MD🫶🏻";

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

// Load commands from commands folder
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');

function loadCommands() {
    commands.clear();
    
    if (!fs.existsSync(commandsPath)) {
        console.log("❌ Commands directory not found:", commandsPath);
        fs.mkdirSync(commandsPath, { recursive: true });
        console.log("✅ Created commands directory");
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
        file.endsWith('.js') && !file.startsWith('.')
    );

    console.log(`📂 Loading commands from ${commandFiles.length} files...`);

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            if (require.cache[require.resolve(filePath)]) {
                delete require.cache[require.resolve(filePath)];
            }
            
            const commandModule = require(filePath);
            
            if (commandModule.pattern && commandModule.execute) {
                commands.set(commandModule.pattern, commandModule);
                console.log(`✅ Loaded command: ${commandModule.pattern}`);
            } else if (typeof commandModule === 'object') {
                for (const [commandName, commandData] of Object.entries(commandModule)) {
                    if (commandData.pattern && commandData.execute) {
                        commands.set(commandData.pattern, commandData);
                        console.log(`✅ Loaded command: ${commandData.pattern}`);
                        
                        if (commandData.alias && Array.isArray(commandData.alias)) {
                            commandData.alias.forEach(alias => {
                                commands.set(alias, commandData);
                                console.log(`✅ Loaded alias: ${alias} -> ${commandData.pattern}`);
                            });
                        }
                    }
                }
            } else {
                console.log(`⚠️ Skipping ${file}: invalid command structure`);
            }
        } catch (error) {
            console.error(`❌ Error loading commands from ${file}:`, error.message);
        }
    }

    const runtimeCommand = runtimeTracker.getRuntimeCommand();
    if (runtimeCommand.pattern && runtimeCommand.execute) {
        commands.set(runtimeCommand.pattern, runtimeCommand);
    }
}

loadCommands();

if (fs.existsSync(commandsPath)) {
    fs.watch(commandsPath, (eventType, filename) => {
        if (filename && filename.endsWith('.js')) {
            console.log(`🔄 Reloading command: ${filename}`);
            loadCommands();
        }
    });
}

// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API endpoint to request pairing code
app.post("/api/pair", async (req, res) => {
    let conn;
    try {
        const { number } = req.body;
        if (!number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const normalizedNumber = number.replace(/\D/g, "");
        const sessionDir = path.join(__dirname, "sessions", normalizedNumber);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
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

        const isNewUser = !activeConnections.has(normalizedNumber) && 
                         !fs.existsSync(path.join(sessionDir, 'creds.json'));

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

        await new Promise(resolve => setTimeout(resolve, 3000));

        const pairingCode = await conn.requestPairingCode(normalizedNumber);
        pairingCodes.set(normalizedNumber, { code: pairingCode, timestamp: Date.now() });

        res.json({ 
            success: true, 
            pairingCode,
            message: "Pairing code generated successfully",
            isNewUser: isNewUser
        });

    } catch (error) {
        console.error("Error generating pairing code:", error);
        if (conn) {
            try { conn.ws.close(); } catch (e) {}
        }
        res.status(500).json({ 
            error: "Failed to generate pairing code",
            details: error.message 
        });
    }
});

// Channel subscription function - CONSOLE ONLY (no WhatsApp message)
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

// Function to get message type
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

// ============================================
// 📝 UPDATED PROFESSIONAL BUILT-IN MENU
// ============================================
// ============================================
// 📝 PROFESSIONAL BUILT-IN MENU (Clean Design)
// ============================================
function generateMenu(userPrefix, sessionId) {
    // Get built-in commands
    const builtInCommands = [
        { name: 'ping', tags: ['utility'] },
        { name: 'prefix', tags: ['settings'] },
        { name: 'menu', tags: ['utility'] }
    ];
    
    // Get commands from commands folder
    const folderCommands = [];
    for (const [pattern, command] of commands.entries()) {
        // Skip aliases
        if (command.name && command.name !== pattern) continue;
        if (command.pattern && command.pattern !== pattern) continue;
        
        // Get category
        let category = command.category || 'general';
        if (command.tags && Array.isArray(command.tags)) {
            category = command.tags[0] || category;
        }
        
        folderCommands.push({
            name: pattern,
            tags: [category]
        });
    }
    
    // Combine all commands
    const allCommands = [...builtInCommands, ...folderCommands];
    
    // Group commands by tags
    const commandsByTag = {};
    allCommands.forEach(cmd => {
        const tags = Array.isArray(cmd.tags) ? cmd.tags : [cmd.tags || 'general'];
        tags.forEach(tag => {
            if (!commandsByTag[tag]) {
                commandsByTag[tag] = [];
            }
            commandsByTag[tag].push(cmd);
        });
    });
    
    // Build menu text with professional design
    const displayOwner = OWNER_NAME;
    
    // ============================================
    // PROFESSIONAL MENU DESIGN
    // ============================================
    let menuText = `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   🐘 ${BOT_NAME}                    ┃
┃   ─────────────────────────        ┃
┃   ✦ Multi-Device WhatsApp Bot      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   📊 BOT INFO                     ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃   Prefix    : ${userPrefix}                  ┃
┃   Commands  : ${allCommands.length}                 ┃
┃   Owner     : ${displayOwner}           ┃
┃   Version   : 7.0.0                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   📋 COMMANDS LIST                ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
`;

    // Category labels with emojis
    const categoryLabels = {
        utility: '🛠 UTILITY',
        settings: '⚙ SETTINGS',
        general: '📌 GENERAL',
        admin: '🛡 ADMIN',
        group: '👥 GROUP',
        fun: '🎮 FUN',
        media: '🎬 MEDIA',
        ai: '🤖 AI',
        economy: '💰 ECONOMY',
        owner: '👑 OWNER',
        sticker: '🎨 STICKER',
        download: '📥 DOWNLOAD',
        converter: '🔄 CONVERTER',
        tools: '🔧 TOOLS'
    };
    
    // Category order
    const categoryOrder = [
        'utility', 'settings', 'general', 'admin', 'group', 
        'fun', 'media', 'ai', 'economy', 'owner',
        'sticker', 'download', 'converter', 'tools'
    ];
    
    // Display categories in order
    let hasCommands = false;
    for (const cat of categoryOrder) {
        if (!commandsByTag[cat]) continue;
        if (commandsByTag[cat].length === 0) continue;
        
        hasCommands = true;
        const label = categoryLabels[cat] || cat.toUpperCase();
        menuText += `┃ ${label}\n`;
        menuText += `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n`;
        
        // Sort commands alphabetically
        const sorted = commandsByTag[cat].sort((a, b) => a.name.localeCompare(b.name));
        
        // Display 4 commands per row for cleaner look
        let row = [];
        for (const cmd of sorted) {
            row.push(`${userPrefix}${cmd.name}`);
        }
        
        // Display as 2 columns
        const colWidth = 16;
        for (let i = 0; i < row.length; i += 2) {
            let line = '┃';
            const col1 = row[i] || '';
            const col2 = row[i+1] || '';
            line += ` ${col1.padEnd(colWidth)}`;
            if (col2) line += ` ${col2.padEnd(colWidth)}`;
            line += ' ┃';
            menuText += line + '\n';
        }
        menuText += `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n`;
    }

    // If no categories found, show all commands in 2 columns
    if (!hasCommands) {
        const sorted = allCommands.sort((a, b) => a.name.localeCompare(b.name));
        const row = sorted.map(cmd => `${userPrefix}${cmd.name}`);
        const colWidth = 16;
        for (let i = 0; i < row.length; i += 2) {
            let line = '┃';
            const col1 = row[i] || '';
            const col2 = row[i+1] || '';
            line += ` ${col1.padEnd(colWidth)}`;
            if (col2) line += ` ${col2.padEnd(colWidth)}`;
            line += ' ┃';
            menuText += line + '\n';
        }
        menuText += `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n`;
    }

    // Tips section
    menuText += `┃ 💡 TIPS                         ┃\n`;
    menuText += `┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n`;
    menuText += `┃  📌 ${userPrefix}help <cmd>          ┃\n`;
    menuText += `┃  📌 ${userPrefix}prefix <new>       ┃\n`;
    menuText += `┃  📌 ${userPrefix}menu              ┃\n`;
    menuText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
    menuText += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${displayOwner} • ${BOT_NAME}*\n`;

    return menuText;
}

// Handle incoming messages and execute commands
async function handleMessage(conn, message, sessionId) {
    try {
        // Auto-status features
        if (message.key && message.key.remoteJid === 'status@broadcast') {
            if (AUTO_STATUS_SEEN === "true") {
                await conn.readMessages([message.key]).catch(console.error);
            }
            
            if (AUTO_STATUS_REACT === "true") {
                const botJid = conn.user?.id || 'unknown';
                const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇳🇬', '💜', '💙', '🌝', '🖤', '💚'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await conn.sendMessage(message.key.remoteJid, {
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

        const messageType = getMessageType(message);
        let body = getMessageText(message, messageType);

        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        if (!body.startsWith(userPrefix)) return;

        const args = body.slice(userPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`🔍 Detected command: ${commandName} from user: ${sessionId}`);

        // Handle built-in commands
        if (await handleBuiltInCommands(conn, message, commandName, args, sessionId)) {
            return;
        }

        // Find and execute command from commands folder
        if (commands.has(commandName)) {
            const command = commands.get(commandName);
            console.log(`🔧 Executing command: ${commandName} for session: ${sessionId}`);
            
            try {
                const reply = (text, options = {}) => {
                    return conn.sendMessage(message.key.remoteJid, { text }, { 
                        quoted: message, 
                        ...options 
                    });
                };
                
                let groupMetadata = null;
                const from = message.key.remoteJid;
                const isGroup = from.endsWith('@g.us');
                
                if (isGroup) {
                    try {
                        groupMetadata = await conn.groupMetadata(from);
                    } catch (error) {
                        console.error("Error fetching group metadata:", error);
                    }
                }
                
                const quotedMessage = getQuotedMessage(message);
                const m = {
                    mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                    quoted: quotedMessage,
                    sender: message.key.participant || message.key.remoteJid
                };
                
                const q = body.slice(userPrefix.length + commandName.length).trim();
                
                let isAdmins = false;
                let isCreator = false;
                
                if (isGroup && groupMetadata) {
                    const participant = groupMetadata.participants.find(p => p.id === m.sender);
                    isAdmins = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                    isCreator = participant?.admin === 'superadmin';
                }
                
                const paramCount = command.execute.length;
                if (paramCount >= 4) {
                    await command.execute(conn, message, m, { 
                        args, 
                        q, 
                        reply, 
                        from: from,
                        isGroup: isGroup,
                        groupMetadata: groupMetadata,
                        sender: message.key.participant || message.key.remoteJid,
                        isAdmins: isAdmins,
                        isCreator: isCreator
                    });
                } else {
                    await command.execute(conn, m, { 
                        args, 
                        q, 
                        reply, 
                        from: from,
                        isGroup: isGroup,
                        groupMetadata: groupMetadata,
                        sender: message.key.participant || message.key.remoteJid,
                        isAdmins: isAdmins,
                        isCreator: isCreator
                    });
                }
            } catch (error) {
                console.error(`❌ Error executing command ${commandName}:`, error);
            }
        } else {
            console.log(`⚠️ Command not found: ${commandName}`);
        }
    } catch (error) {
        console.error("Error handling message:", error);
    }
}

// Handle built-in commands - UPDATED WITH NEW MENU
async function handleBuiltInCommands(conn, message, commandName, args, sessionId) {
    try {
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        const from = message.key.remoteJid;
        
        // Handle newsletter/channel messages differently
        if (from.endsWith('@newsletter')) {
            console.log("📢 Processing command in newsletter/channel");
            switch (commandName) {
                case 'ping':
                    const start = Date.now();
                    const end = Date.now();
                    const responseTime = (end - start) / 1000;
                    const details = `⚡ *${BOT_NAME} SPEED CHECK* ⚡\n\n⏱️ Response Time: *${responseTime.toFixed(2)}s* ⚡\n👤 Owner: *${OWNER_NAME}*`;
                    try {
                        if (conn.newsletterSend) {
                            await conn.newsletterSend(from, { text: details });
                        } else {
                            await conn.sendMessage(from, { text: details });
                        }
                    } catch (error) {
                        console.error("Error sending to newsletter:", error);
                    }
                    return true;
                default:
                    return true;
            }
        }
        
        // Regular chat/group message handling
        switch (commandName) {
            case 'ping':
            case 'speed':
                const pingStart = Date.now();
                await conn.sendMessage(from, { 
                    text: `🏓 Pong! Checking speed...` 
                }, { quoted: message });
                const pingEnd = Date.now();
                const reactionEmojis = ['🔥', '⚡', '🚀', '💨', '🎯', '🎉', '🌟', '💥', '🕐', '🔹'];
                const reactionEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
                const responseTime = (pingEnd - pingStart) / 1000;
                const details = `⚡ *${BOT_NAME} SPEED CHECK* ⚡\n\n⏱️ Response Time: *${responseTime.toFixed(2)}s* ${reactionEmoji}\n👤 Owner: *${OWNER_NAME}*`;
                await conn.sendMessage(from, {
                    text: details,
                    contextInfo: {
                        externalAdReply: {
                            title: "⚡ Speed Test",
                            body: `${BOT_NAME} Performance Check`,
                            thumbnailUrl: MENU_IMAGE_URL,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: message });
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
                
            case 'menu':
case 'help':
case 'commands':
    try {
        const menu = generateMenu(userPrefix, sessionId);
        await conn.sendMessage(from, {
            text: menu,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: `🐘 ${BOT_NAME}`,
                    body: `⚡ Powered by ${OWNER_NAME}`,
                    thumbnailUrl: MENU_IMAGE_URL,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: message });
    } catch (menuError) {
        console.error('❌ Menu error:', menuError);
        // Simple fallback menu
        await conn.sendMessage(from, {
            text: `🐘 ${BOT_NAME} Menu\n\n📌 Prefix: ${userPrefix}\n\nCommands:\n${userPrefix}ping\n${userPrefix}prefix\n${userPrefix}menu\n\nPowered by ${OWNER_NAME}`
        }, { quoted: message });
    }
    return true;
    }
  }
// Setup connection event handlers
function setupConnectionHandlers(conn, sessionId, io, saveCreds) {
    let hasShownConnectedMessage = false;
    let isLoggedOut = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    conn.ev.on('group-participants.update', async (update) => {
        console.log("🔥 group-participants.update fired:", update);
        try {
            await GroupEvents(conn, update);
        } catch (error) {
            console.error("Error in group-participants.update handler:", error);
        }
    });
    
    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        console.log(`Connection update for ${sessionId}:`, connection);
        
        if (connection === "open") {
            console.log(`✅ WhatsApp connected for session: ${sessionId}`);
            console.log(`🟢 CONNECTED — ${BOT_NAME} is now active for ${sessionId}`);
            
            isLoggedOut = false;
            reconnectAttempts = 0;
            activeSockets++;
            broadcastStats();
            
            io.emit("linked", { sessionId });
            
            if (!hasShownConnectedMessage) {
                hasShownConnectedMessage = true;
                setTimeout(async () => {
                    try {
                        // Channel subscription - CONSOLE ONLY (no WhatsApp message)
                        await subscribeToChannels(conn);
                        
                        let name = "User";
                        try {
                            name = conn.user?.name || "User";
                        } catch (error) {}
                        
                        const welcomeMsg = `
╔══════════════════════╗
║  🐘 ${BOT_NAME} 🐘  ║
╚══════════════════════╝

👋 Hey *${name}* 🤩  
🎉 Connected successfully!  

📌 Prefix: ${PREFIX}

💡 Use ${PREFIX}menu to see all commands
                        `;

                        const userJid = `${conn.user.id.split(":")[0]}@s.whatsapp.net`;
                        await conn.sendMessage(userJid, { 
                            text: welcomeMsg,
                            contextInfo: {
                                mentionedJid: [userJid],
                                forwardingScore: 999,
                                externalAdReply: {
                                    title: `${BOT_NAME} Connected 🚀`,
                                    body: `⚡ Powered by ${OWNER_NAME}`,
                                    thumbnailUrl: MENU_IMAGE_URL,
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        });
                    } catch (error) {
                        console.error("Error sending welcome message:", error);
                    }
                }, 3000);
            }
        }
        
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔁 Connection closed, attempting to reconnect session: ${sessionId} (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                hasShownConnectedMessage = false;
                setTimeout(() => {
                    if (activeConnections.has(sessionId)) {
                        const { conn: existingConn } = activeConnections.get(sessionId);
                        try { existingConn.ws.close(); } catch (e) {}
                        initializeConnection(sessionId);
                    }
                }, 5000);
            } else {
                console.log(`🔒 Logged out from session: ${sessionId}`);
                isLoggedOut = true;
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        cleanupSession(sessionId, true);
                    }, 5000);
                }
                activeConnections.delete(sessionId);
                io.emit("unlinked", { sessionId });
            }
        }
    });

    conn.ev.on("creds.update", async () => {
        if (saveCreds) {
            await saveCreds();
        }
    });

    conn.ev.on("messages.upsert", async (m) => {
        try {
            const message = m.messages[0];
            if (!message) return;
            
            let currentSessionId = sessionId;
            const botJid = conn.user?.id || 'unknown';
            const normalizedBotJid = botJid.includes(':') ? botJid.split(':')[0] + '@s.whatsapp.net' : botJid;
            const isFromBot = message.key.fromMe || 
                              (message.key.participant && message.key.participant === normalizedBotJid) ||
                              (message.key.remoteJid && message.key.remoteJid === normalizedBotJid);
            
            if (message.key.fromMe && !isFromBot) return;
            
            const from = message.key.remoteJid;
            
            if (from === "status@broadcast") {
                if (AUTO_STATUS_SEEN === "true") {
                    await conn.readMessages([message.key]).catch(console.error);
                }
                if (AUTO_STATUS_REACT === "true") {
                    const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇳🇬', '💜', '💙', '🌝', '🖤', '💚'];
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    await conn.sendMessage(from, {
                        react: { text: randomEmoji, key: message.key }
                    }, { statusJidList: [message.key.participant, botJid] }).catch(console.error);
                }
                if (AUTO_STATUS_REPLY === "true") {
                    const user = message.key.participant;
                    await conn.sendMessage(user, { text: AUTO_STATUS_MSG, react: { text: '💜', key: message.key } }, { quoted: message }).catch(console.error);
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
            
            if (from.endsWith('@newsletter') || from.endsWith('@g.us') || from.endsWith('@s.whatsapp.net') || isFromBot) {
                await handleMessage(conn, message, currentSessionId);
            }
            
            const messageType = getMessageType(message);
            let messageText = getMessageText(message, messageType);
            
            if (!message.key.fromMe || isFromBot) {
                const timestamp = new Date(message.messageTimestamp * 1000).toLocaleTimeString();
                const isGroup = from.endsWith('@g.us');
                const sender = message.key.fromMe ? conn.user?.id || 'unknown' : (message.key.participant || message.key.remoteJid);
                if (isGroup) {
                    console.log(`[${timestamp}] [GROUP: ${from}] ${sender}: ${messageText} (${messageType})`);
                } else {
                    console.log(`[${timestamp}] [PRIVATE] ${sender}: ${messageText} (${messageType})`);
                }
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });
}

// Function to reinitialize connection
async function initializeConnection(sessionId) {
    try {
        const sessionDir = path.join(__dirname, "sessions", sessionId);
        if (!fs.existsSync(sessionDir)) {
            console.log(`Session directory not found for ${sessionId}`);
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
    } catch (error) {
        console.error(`Error reinitializing connection for ${sessionId}:`, error);
    }
}

// Clean up session folder
function cleanupSession(sessionId, deleteEntireFolder = false) {
    const sessionDir = path.join(__dirname, "sessions", sessionId);
    if (fs.existsSync(sessionDir)) {
        if (deleteEntireFolder) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log(`🗑️ Deleted session folder due to logout: ${sessionId}`);
        } else {
            console.log(`📁 Session preservation: Keeping all files for ${sessionId}`);
        }
    }
}

// API endpoint to get loaded commands
app.get("/api/commands", (req, res) => {
    const commandList = Array.from(commands.keys());
    res.json({ commands: commandList });
});

// Socket.io connection handling
io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);
    socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
    });
    socket.on("force-request-qr", () => {
        console.log("QR code regeneration requested");
    });
});

// Session preservation routine
setInterval(() => {
    const sessionsDir = path.join(__dirname, "sessions");
    if (!fs.existsSync(sessionsDir)) return;
    const sessions = fs.readdirSync(sessionsDir);
    const now = Date.now();
    sessions.forEach(session => {
        const sessionPath = path.join(sessionsDir, session);
        const stats = fs.statSync(sessionPath);
        const age = now - stats.mtimeMs;
        if (age > 5 * 60 * 1000 && !activeConnections.has(session)) {
            console.log(`📊 Session ${session} is ${Math.round(age/60000)} minutes old - PRESERVED`);
        }
    });
}, 5 * 60 * 1000);

// Function to reload existing sessions on server restart
async function reloadExistingSessions() {
    console.log("🔄 Checking for existing sessions to reload...");
    const sessionsDir = path.join(__dirname, "sessions");
    if (!fs.existsSync(sessionsDir)) {
        console.log("📁 No sessions directory found, skipping session reload");
        return;
    }
    const sessions = fs.readdirSync(sessionsDir);
    console.log(`📂 Found ${sessions.length} session directories`);
    for (const sessionId of sessions) {
        const sessionDir = path.join(sessionsDir, sessionId);
        const stat = fs.statSync(sessionDir);
        if (stat.isDirectory()) {
            console.log(`🔄 Attempting to reload session: ${sessionId}`);
            try {
                const credsPath = path.join(sessionDir, "creds.json");
                if (fs.existsSync(credsPath)) {
                    await initializeConnection(sessionId);
                    console.log(`✅ Successfully reloaded session: ${sessionId}`);
                    activeSockets++;
                    console.log(`📊 Active sockets increased to: ${activeSockets}`);
                } else {
                    console.log(`❌ No valid auth state found for session: ${sessionId}`);
                    console.log(`📁 Keeping session folder for potential reuse: ${sessionId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to reload session ${sessionId}:`, error.message);
                console.log(`📁 Preserving session folder despite error: ${sessionId}`);
            }
        }
    }
    console.log("✅ Session reload process completed");
    broadcastStats();
}

// Start the server
server.listen(port, async () => {
    console.log(`🚀 ${BOT_NAME} server running on http://localhost:${port}`);
    console.log(`📱 WhatsApp bot initialized`);
    console.log(`🔧 Loaded ${commands.size} commands`);
    console.log(`📊 Starting with ${totalUsers} total users (persistent)`);
    console.log(`🔄 Keep-alive ping every 14 minutes (prevents Render sleep)`);
    await reloadExistingSessions();
});

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown() {
  if (isShuttingDown) {
    console.log("🛑 Shutdown already in progress...");
    return;
  }
  isShuttingDown = true;
  console.log("\n🛑 Shutting down server...");
  savePersistentData();
  console.log(`💾 Saved persistent data: ${totalUsers} total users`);
  
  let connectionCount = 0;
  activeConnections.forEach((data, sessionId) => {
    try {
      if (data.conn && data.conn.ws) {
        data.conn.ws.close();
        console.log(`🔒 Closed WhatsApp connection for session: ${sessionId}`);
        connectionCount++;
      }
    } catch (error) {}
  });
  
  console.log(`✅ Closed ${connectionCount} WhatsApp connections`);
  console.log(`📁 All session folders preserved for next server start`);
  
  const shutdownTimeout = setTimeout(() => {
    console.log("⚠️  Force shutdown after timeout");
    process.exit(0);
  }, 3000);
  
  server.close(() => {
    clearTimeout(shutdownTimeout);
    console.log("✅ Server shut down gracefully");
    console.log("📁 Session folders preserved - they will be reloaded on next server start");
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  console.log("\nReceived SIGINT signal");
  gracefulShutdown();
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM signal");
  gracefulShutdown();
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error.message);
  console.error(error.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});
