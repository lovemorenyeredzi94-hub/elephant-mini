const express = require("express");
const http = require("http");
require("dotenv").config();
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");

// ====================================
// IMPORT DATABASE
// ====================================
const { 
    connectDB,
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
    removeWarningFromDB,
    clearWarningsFromDB,
    muteUserInDB,
    unmuteUserInDB,
    isUserMutedInDB,
    trackMessageForSpam
} = require('./lib./database');

// ====================================
// IMPORT HANDLER
// ====================================
const { 
    handleMessage,
    handleGroupUpdate,
    handleAntilink,
    handleAntibadword,
    handleAntisticker,
    handleAntigroupstatus,
    handleAntigroupmention,
    initializeAntiCall,
    isOwner,
    isAdmin,
    isBotAdmin,
    isMod,
    getGroupMetadata,
    sendWithFooter,
    QUOTED_MSG
} = require('./handler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

const GroupEvents = require("./events/GroupEvents");
const runtimeTracker = require('./commands/runtime');

// ====================================
// CONNECT TO MONGODB ON STARTUP
// ====================================
connectDB().then(() => {
    console.log("✅ Database ready!");
}).catch(err => {
    console.error("❌ Database connection failed:", err);
});

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

// Save persistent data
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

// Initialize persistent data
loadPersistentData();

// Auto-save persistent data every 30 seconds
setInterval(() => {
    savePersistentData();
}, 30000);

// Clean up status media store periodically
setInterval(() => {
    const now = Date.now();
    const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [key, value] of statusMediaStore.entries()) {
        if (now - value.timestamp > MAX_AGE) {
            statusMediaStore.delete(key);
        }
    }
}, 60 * 60 * 1000); // Clean every hour

// Stats broadcasting helper
function broadcastStats() {
    io.emit("statsUpdate", { activeSockets, totalUsers });
}

// Track frontend connections
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

// Default prefix for bot commands
let PREFIX = process.env.PREFIX || ".";

// Bot configuration from environment variables
const BOT_NAME = process.env.BOT_NAME || "The TechX";
const OWNER_NAME = process.env.OWNER_NAME || "SILVER xZAMAN";

const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://up6.cc/2026/04/177631893622821.jpg";
const REPO_LINK = process.env.REPO_LINK || "https://github.com";

// Auto-status configuration
const AUTO_STATUS_SEEN = process.env.AUTO_STATUS_SEEN || "true";
const AUTO_STATUS_REACT = process.env.AUTO_STATUS_REACT || "true";
const AUTO_STATUS_REPLY = process.env.AUTO_STATUS_REPLY || "false";
const AUTO_STATUS_MSG = process.env.AUTO_STATUS_MSG || "YOUR STATUS HAS BEEN SEEN BY 𝙏𝙝𝙚 𝙏𝙚𝙘𝙝𝙓🫶🏻";
const DEV = process.env.DEV || 'SILVERxZAMAN';

// Track login state globally
let isUserLoggedIn = false;

// ====================================
// PREVENT RENDER AUTO-SLEEP
// ====================================
// Keep-alive endpoint for Render
app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

// Auto-ping Render every 14 minutes (Render sleeps after 15 mins of inactivity)
setInterval(() => {
    const url = `http://localhost:${port}/ping`;
    fetch(url).catch(err => console.log('Keep-alive ping failed:', err.message));
    console.log('🔄 Keep-alive ping sent at', new Date().toLocaleTimeString());
}, 14 * 60 * 1000); // 14 minutes

// Also ping the external URL if RENDER_EXTERNAL_URL is set (for production)
if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
        fetch(process.env.RENDER_EXTERNAL_URL + '/ping')
            .then(res => console.log('✅ External ping sent'))
            .catch(err => console.log('External ping failed:', err.message));
    }, 14 * 60 * 1000);
}

// ====================================
// COMMAND LOADER WITH HOT RELOAD
// Supports: pattern + name, desc + description, alias + aliases
// ====================================
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
let commandLoadTime = 0;
let totalCommands = 0;

/**
 * Normalize command object to standard format
 */
function normalizeCommand(cmd, defaultName) {
    const name = cmd.pattern || cmd.name || defaultName;
    
    return {
        ...cmd,
        name: name,
        pattern: name,
        category: cmd.category || 'general',
        description: cmd.desc || cmd.description || 'No description',
        usage: cmd.usage || `${PREFIX}${name}`,
        // Keep both for compatibility
        alias: cmd.alias || cmd.aliases || [],
        aliases: cmd.alias || cmd.aliases || []
    };
}

/**
 * Load all commands from the commands folder
 */
function loadCommands() {
    const startTime = Date.now();
    commands.clear();
    let loadedCount = 0;
    let aliasCount = 0;
    
    // Check if commands folder exists
    if (!fs.existsSync(commandsPath)) {
        console.log("❌ Commands directory not found:", commandsPath);
        fs.mkdirSync(commandsPath, { recursive: true });
        console.log("✅ Created commands directory at:", commandsPath);
        return;
    }

    // Get all .js files
    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
        file.endsWith('.js') && 
        !file.startsWith('.') && 
        !file.includes('.test.') &&
        !file.includes('.spec.')
    );

    console.log(`📂 Found ${commandFiles.length} command files...`);

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            
            // Clear cache for hot reload
            if (require.cache[require.resolve(filePath)]) {
                delete require.cache[require.resolve(filePath)];
            }
            
            const commandModule = require(filePath);
            
            // FORMAT 1: Single command
            const cmdName = commandModule.pattern || commandModule.name;
            
            if (cmdName && commandModule.execute) {
                if (commands.has(cmdName)) {
                    console.warn(`⚠️ Duplicate command: ${cmdName} (from ${file}) - overwriting`);
                }
                
                const normalizedCmd = normalizeCommand(commandModule, cmdName);
                commands.set(cmdName, normalizedCmd);
                loadedCount++;
                console.log(`✅ Loaded command: ${cmdName} [${normalizedCmd.category}]`);
                
                const aliases = commandModule.alias || commandModule.aliases || [];
                if (Array.isArray(aliases) && aliases.length > 0) {
                    for (const alias of aliases) {
                        if (commands.has(alias)) {
                            console.warn(`⚠️ Duplicate alias: ${alias} (from ${file}) - overwriting`);
                        }
                        commands.set(alias, normalizedCmd);
                        aliasCount++;
                        console.log(`   └─ Alias: ${alias}`);
                    }
                }
                continue;
            }
            
            // FORMAT 2: Multi-command object
            if (typeof commandModule === 'object' && !Array.isArray(commandModule)) {
                let hasValidCommand = false;
                
                for (const [key, cmd] of Object.entries(commandModule)) {
                    if (!cmd || typeof cmd !== 'object') continue;
                    
                    const cmdName = cmd.pattern || cmd.name || key;
                    if (!cmdName || !cmd.execute) continue;
                    
                    hasValidCommand = true;
                    
                    if (commands.has(cmdName)) {
                        console.warn(`⚠️ Duplicate command: ${cmdName} (from ${file}) - overwriting`);
                    }
                    
                    const normalizedCmd = normalizeCommand(cmd, cmdName);
                    commands.set(cmdName, normalizedCmd);
                    loadedCount++;
                    console.log(`✅ Loaded command: ${cmdName} [${normalizedCmd.category}]`);
                    
                    const aliases = cmd.alias || cmd.aliases || [];
                    if (Array.isArray(aliases) && aliases.length > 0) {
                        for (const alias of aliases) {
                            if (commands.has(alias)) {
                                console.warn(`⚠️ Duplicate alias: ${alias} (from ${file}) - overwriting`);
                            }
                            commands.set(alias, normalizedCmd);
                            aliasCount++;
                            console.log(`   └─ Alias: ${alias}`);
                        }
                    }
                }
                
                if (!hasValidCommand) {
                    console.log(`⚠️ Skipping ${file}: No valid commands found`);
                }
                continue;
            }
            
            // FORMAT 3: Command array
            if (Array.isArray(commandModule)) {
                for (const cmd of commandModule) {
                    const cmdName = cmd.pattern || cmd.name;
                    if (cmdName && cmd.execute) {
                        if (commands.has(cmdName)) {
                            console.warn(`⚠️ Duplicate command: ${cmdName} (from ${file}) - overwriting`);
                        }
                        
                        const normalizedCmd = normalizeCommand(cmd, cmdName);
                        commands.set(cmdName, normalizedCmd);
                        loadedCount++;
                        console.log(`✅ Loaded command: ${cmdName} [${normalizedCmd.category}]`);
                    }
                }
                continue;
            }
            
            console.log(`⚠️ Skipping ${file}: Unknown command format`);
            
        } catch (error) {
            console.error(`❌ Error loading ${file}:`, error.message);
            console.error(`   Stack:`, error.stack);
        }
    }
    
    totalCommands = loadedCount;
    commandLoadTime = Date.now() - startTime;
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Loaded ${loadedCount} commands + ${aliasCount} aliases`);
    console.log(`⏱️  Load time: ${commandLoadTime}ms`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

// ====================================
// COMMAND AUTO-RELOAD (Hot Reload)
// ====================================
let reloadTimeout = null;

function setupCommandWatcher() {
    if (!fs.existsSync(commandsPath)) {
        console.log("⚠️ Commands directory doesn't exist, skipping watcher");
        return;
    }

    console.log(`👀 Watching for command changes in: ${commandsPath}`);
    
    fs.watch(commandsPath, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        if (filename.startsWith('.')) return;
        
        console.log(`🔄 Detected change in: ${filename} (${eventType})`);
        
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
            console.log(`🔄 Reloading commands...`);
            loadCommands();
            
            if (io) {
                io.emit('commandsReloaded', {
                    total: commands.size,
                    timestamp: new Date().toISOString()
                });
            }
        }, 500);
    });
}

// ====================================
// INITIAL LOAD
// ====================================
loadCommands();
setupCommandWatcher();

// ====================================
// API: Get command list
// ====================================
app.get("/api/commands", (req, res) => {
    const commandList = Array.from(commands.entries()).map(([name, cmd]) => ({
        name: name,
        pattern: cmd.pattern || name,
        category: cmd.category || 'general',
        description: cmd.desc || cmd.description || 'No description',
        usage: cmd.usage || `${PREFIX}${name}`,
        isAlias: cmd.pattern !== name && cmd.name !== name
    }));
    
    res.json({
        total: commands.size,
        commands: commandList,
        loadTime: commandLoadTime,
        loadedAt: new Date().toISOString()
    });
});

// ====================================
// API: Reload commands manually
// ====================================
app.post("/api/reload-commands", (req, res) => {
    try {
        loadCommands();
        res.json({ 
            success: true, 
            message: `Reloaded ${commands.size} commands`,
            total: commands.size,
            loadTime: commandLoadTime
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Make commands accessible globally
global.commands = commands;

// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====================================
// PAIRING ENDPOINT WITH MONGODB
// ====================================
app.post("/api/pair", async (req, res) => {
    let conn;
    try {
        const { number } = req.body;
        
        console.log("📱 Pairing request received for number:", number);
        
        if (!number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const normalizedNumber = number.replace(/\D/g, "");
        console.log(`📱 Normalized number: ${normalizedNumber}`);
        
        if (normalizedNumber.length < 10 || normalizedNumber.length > 15) {
            return res.status(400).json({ 
                error: "Invalid phone number", 
                details: "Number must be between 10-15 digits" 
            });
        }
        
        // ====================================
        // CHECK IF SESSION EXISTS IN MONGODB
        // ====================================
        const existingSession = await getSessionFromDB(normalizedNumber);
        
        const sessionDir = path.join(__dirname, "sessions", normalizedNumber);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // ====================================
        // IF SESSION EXISTS, RESTORE IT
        // ====================================
        if (existingSession) {
            console.log(`🔄 Restoring session from MongoDB for ${normalizedNumber}`);
            fs.writeFileSync(
                path.join(sessionDir, 'creds.json'), 
                JSON.stringify(existingSession, null, 2)
            );
        }

        console.log("🔄 Initializing WhatsApp connection...");
        
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

        // ====================================
        // SETUP CONNECTION HANDLERS
        // ====================================
        setupConnectionHandlers(conn, normalizedNumber, io, saveCreds);

        // WAIT for connection to be ready
        console.log("⏳ Waiting for connection to initialize...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log(`🔑 Requesting pairing code for ${normalizedNumber}...`);
        
        const pairingCode = await conn.requestPairingCode(normalizedNumber);
        console.log(`✅ Pairing code generated: ${pairingCode}`);
        
        // ====================================
        // SAVE PAIRING CODE TO MONGODB
        // ====================================
        await savePairingCodeToDB(normalizedNumber, normalizedNumber, pairingCode);
        
        pairingCodes.set(normalizedNumber, { 
            code: pairingCode, 
            timestamp: Date.now(),
            number: normalizedNumber
        });

        const response = { 
            success: true, 
            pairingCode: pairingCode,
            message: "📱 Pairing code generated! Check your WhatsApp for the notification or enter this code manually.",
            isNewUser: isNewUser,
            number: normalizedNumber,
            instructions: "Open WhatsApp → Settings → Linked Devices → Link with Phone Number"
        };
        
        console.log("📤 Sending response:", response);
        res.json(response);

    } catch (error) {
        console.error("❌ Error generating pairing code:", error);
        console.error("Error details:", error.stack);
        
        if (conn) {
            try {
                conn.ws.close();
            } catch (e) {
                console.log("Error closing connection:", e.message);
            }
        }
        
        res.status(500).json({ 
            error: "Failed to generate pairing code",
            details: error.message,
            suggestion: "Make sure your phone number is correct and WhatsApp is installed"
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
// CONNECTION HANDLERS WITH MONGODB + HANDLER
// ====================================
function setupConnectionHandlers(conn, sessionId, io, saveCreds) {
    let hasShownConnectedMessage = false;
    let isLoggedOut = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    // ====================================
    // CREDENTIALS UPDATE - SAVE TO MONGODB
    // ====================================
    conn.ev.on("creds.update", async () => {
        if (saveCreds) {
            await saveCreds();
            
            try {
                const sessionDir = path.join(__dirname, "sessions", sessionId);
                const credsPath = path.join(sessionDir, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                    await saveSessionToDB(sessionId, credsData);
                    console.log(`💾 Credentials saved to MongoDB for ${sessionId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to save credentials to MongoDB:`, error);
            }
        }
    });
    
    // ====================================
    // CONNECTION UPDATE
    // ====================================
    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
        console.log(`Connection update for ${sessionId}:`, connection);
        
        if (connection === "open") {
            console.log(`✅ WhatsApp connected for session: ${sessionId}`);
            console.log(`🟢 CONNECTED — ${BOT_NAME} is now active for ${sessionId}`);
            
            isUserLoggedIn = true;
            isLoggedOut = false;
            reconnectAttempts = 0;
            activeSockets++;
            broadcastStats();
            
            // ====================================
            // ADD TO ACTIVE NUMBERS IN MONGODB
            // ====================================
            await addActiveNumberToDB(sessionId, sessionId);
            
            io.emit("linked", { sessionId });
            
            // ====================================
            // INITIALIZE ANTI-CALL
            // ====================================
            initializeAntiCall(conn);
            
            if (!hasShownConnectedMessage) {
                hasShownConnectedMessage = true;
                
                setTimeout(async () => {
                    try {
                        // ====================================
                        // SUBSCRIBE TO CHANNELS (CONSOLE ONLY)
                        // ====================================
                        await subscribeToChannels(conn);
                        
                        let name = "User";
                        try {
                            name = conn.user?.name || "User";
                        } catch (error) {
                            console.log("Could not get user name:", error.message);
                        }
                        
                        // ====================================
                        // SIMPLIFIED CONNECTED MESSAGE - NO CHANNEL STATUS
                        // ====================================
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
                isLoggedOut = true;
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                
                // ====================================
                // DELETE SESSION FROM MONGODB
                // ====================================
                await deleteSessionFromDB(sessionId);
                console.log(`🗑️ Session deleted from MongoDB for ${sessionId}`);
                
                const sessionDir = path.join(__dirname, "sessions", sessionId);
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                
                activeConnections.delete(sessionId);
                io.emit("unlinked", { sessionId });
                
            } else if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔁 Connection closed, attempting to reconnect session: ${sessionId} (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                
                hasShownConnectedMessage = false;
                
                setTimeout(() => {
                    if (activeConnections.has(sessionId)) {
                        const { conn: existingConn } = activeConnections.get(sessionId);
                        try {
                            existingConn.ws.close();
                        } catch (e) {}
                        
                        initializeConnection(sessionId);
                    }
                }, 5000);
            } else {
                console.log(`⚠️ Connection closed for ${sessionId} with status: ${statusCode}`);
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                
                // ====================================
                // REMOVE FROM ACTIVE NUMBERS
                // ====================================
                await removeActiveNumberFromDB(sessionId);
            }
        }
    });

    // ====================================
    // REGISTER GROUP PARTICIPANTS UPDATE
    // ====================================
    conn.ev.on('group-participants.update', async (update) => {
        console.log("🔥 group-participants.update fired:", update);
        try {
            // Use the handler's group update function
            await handleGroupUpdate(conn, update);
        } catch (error) {
            console.error("Error in group-participants.update handler:", error);
        }
    });

    // ====================================
    // MESSAGE HANDLER - USING HANDLER.JS
    // ====================================
    conn.ev.on("messages.upsert", async (m) => {
        try {
            const message = m.messages[0];
            if (!message) return;
            
            const botJid = conn.user?.id || 'unknown';
            const normalizedBotJid = botJid.includes(':') ? botJid.split(':')[0] + '@s.whatsapp.net' : botJid;
            
            const isFromBot = message.key.fromMe || 
                              (message.key.participant && message.key.participant === normalizedBotJid) ||
                              (message.key.remoteJid && message.key.remoteJid === normalizedBotJid);
            
            // Skip messages from bot
            if (message.key.fromMe && !isFromBot) return;
            
            const from = message.key.remoteJid;
            
            // ====================================
            // AUTO STATUS FEATURES
            // ====================================
            if (from === "status@broadcast") {
                if (AUTO_STATUS_SEEN === "true") {
                    await conn.readMessages([message.key]).catch(console.error);
                }
                
                if (AUTO_STATUS_REACT === "true") {
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
            
            // ====================================
            // TRACK STATS IN MONGODB
            // ====================================
            await incrementStats(sessionId, 'messagesReceived');
            
            const isGroup = from.endsWith('@g.us');
            if (isGroup) {
                await incrementStats(sessionId, 'groupsInteracted');
            }
            
            // ====================================
            // PROCESS MESSAGE USING HANDLER
            // ====================================
            await handleMessage(conn, message);
            
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });
    
    // ====================================
    // ANTI-DELETE HANDLER
    // ====================================
    conn.ev.on('messages.update', async (updates) => {
        try {
            for (const update of updates) {
                if (update.update?.message) {
                    const message = update.key;
                    const from = message.remoteJid;
                    const isGroup = from.endsWith('@g.us');
                    
                    if (!isGroup) continue;
                    
                    // Get group settings from database
                    const settings = await getGroupSettingsFromDB(from);
                    if (!settings?.settings?.antiDelete) continue;
                    
                    const deletedMsg = update.update.message;
                    const sender = message.participant || message.remoteJid;
                    const text = deletedMsg.conversation || 
                               deletedMsg.extendedTextMessage?.text || 
                               'Media message';
                    
                    console.log(`🗑️ ${sender} deleted: ${text}`);
                    
                    // Optional: Notify group
                    await conn.sendMessage(from, {
                        text: `⚠️ @${sender.split('@')[0]} deleted a message:\n"${text}"`,
                        mentions: [sender]
                    });
                }
            }
        } catch (error) {
            console.error('Anti-delete error:', error);
        }
    });
}

// ====================================
// INITIALIZE CONNECTION WITH MONGODB
// ====================================
async function initializeConnection(sessionId) {
    try {
        // ====================================
        // GET SESSION FROM MONGODB
        // ====================================
        let sessionData = await getSessionFromDB(sessionId);
        
        const sessionDir = path.join(__dirname, "sessions", sessionId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        // If not in database, check local files
        if (!sessionData) {
            const credsPath = path.join(sessionDir, 'creds.json');
            if (fs.existsSync(credsPath)) {
                sessionData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                // Save to database for future
                await saveSessionToDB(sessionId, sessionData);
                console.log(`📁 Found local session, saved to database`);
            }
        }
        
        if (sessionData) {
            fs.writeFileSync(
                path.join(sessionDir, 'creds.json'),
                JSON.stringify(sessionData, null, 2)
            );
            console.log(`🔄 Session restored from database for ${sessionId}`);
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
// RELOAD EXISTING SESSIONS FROM MONGODB
// ====================================
async function reloadExistingSessions() {
    console.log("🔄 Loading sessions from MongoDB...");
    
    // ====================================
    // GET ALL SESSIONS FROM MONGODB
    // ====================================
    const sessions = await getAllSessionsFromDB();
    console.log(`📂 Found ${sessions.length} sessions in MongoDB`);
    
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

// Get session status from MongoDB
app.get("/api/session/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await getSessionFromDB(sessionId);
        const config = await getUserConfigFromDB(sessionId);
        const stats = await getStatsForSession(sessionId, 7);
        
        res.json({
            sessionId: sessionId,
            hasSession: !!session,
            config: config,
            stats: stats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete session from MongoDB
app.delete("/api/session/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;
        await deleteSessionFromDB(sessionId);
        
        if (activeConnections.has(sessionId)) {
            const { conn } = activeConnections.get(sessionId);
            try {
                conn.ws.close();
            } catch (e) {}
            activeConnections.delete(sessionId);
            activeSockets = Math.max(0, activeSockets - 1);
            broadcastStats();
        }
        
        res.json({ success: true, message: `Session ${sessionId} deleted` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Socket.io connection handling
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
    console.log(`📊 Starting with ${totalUsers} total users (persistent)`);
    console.log(`🔄 Keep-alive ping every 14 minutes (prevents Render sleep)`);
    
    // ====================================
    // RELOAD SESSIONS FROM MONGODB
    // ====================================
    await reloadExistingSessions();
});

// ====================================
// GRACEFUL SHUTDOWN
// ====================================
let isShuttingDown = false;

async function gracefulShutdown() {
    if (isShuttingDown) {
        console.log("🛑 Shutdown already in progress...");
        return;
    }
    
    isShuttingDown = true;
    console.log("\n🛑 Shutting down server...");
    
    // ====================================
    // SAVE ALL SESSIONS TO MONGODB
    // ====================================
    for (const [sessionId, data] of activeConnections) {
        try {
            const sessionDir = path.join(__dirname, "sessions", sessionId);
            const credsPath = path.join(sessionDir, 'creds.json');
            if (fs.existsSync(credsPath)) {
                const credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                await saveSessionToDB(sessionId, credsData);
                console.log(`💾 Session saved to MongoDB: ${sessionId}`);
            }
        } catch (error) {
            console.error(`Error saving session ${sessionId}:`, error.message);
        }
    }
    
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
        } catch (error) {
            console.log(`Error closing connection for ${sessionId}:`, error.message);
        }
    });
    
    console.log(`✅ Closed ${connectionCount} WhatsApp connections`);
    console.log(`💾 All sessions saved to MongoDB`);
    
    const shutdownTimeout = setTimeout(() => {
        console.log("⚠️ Force shutdown after timeout");
        process.exit(0);
    }, 3000);
    
    server.close(() => {
        clearTimeout(shutdownTimeout);
        console.log("✅ Server shut down gracefully");
        console.log("💾 Sessions preserved in MongoDB");
        process.exit(0);
    });
}

// Handle termination signals
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
