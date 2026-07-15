// === welcome.js ===
const fs = require('fs');
const path = require('path');

const SETTINGS_DIR = './database';
const WELCOME_FILE = path.join(SETTINGS_DIR, 'welcome.json');

// Ensure directory exists
if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

// Load settings
function loadSettings() {
    try {
        if (fs.existsSync(WELCOME_FILE)) {
            return JSON.parse(fs.readFileSync(WELCOME_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

// Save settings
function saveSettings(settings) {
    try {
        fs.writeFileSync(WELCOME_FILE, JSON.stringify(settings, null, 2));
        return true;
    } catch (e) {
        return false;
    }
}

// Check if welcome enabled for group
function isWelcomeEnabled(groupId) {
    const settings = loadSettings();
    return settings[groupId] === true;
}

// Set welcome enabled for group
function setWelcomeEnabled(groupId, status) {
    const settings = loadSettings();
    settings[groupId] = status;
    return saveSettings(settings);
}

module.exports = {
    pattern: "welcome",
    desc: "Toggle welcome messages for this group",
    category: "group",
    react: "🎒",
    use: ".welcome on/off",
    filename: __filename,

    execute: async (conn, message, m, { q, reply, from, isGroup, sender }) => {
        try {
            if (!isGroup) {
                return reply("❌ This command only works in groups!");
            }

            const jidToBase = (jid) => String(jid).split("@")[0].split(":")[0];
            const senderBase = jidToBase(sender);
            const botBase = jidToBase(conn?.user?.id || "");

            // Owner check
            let owners = [];
            if (process.env.OWNER_NUMBER) {
                owners = process.env.OWNER_NUMBER.split(",").map(num => num.trim());
            }
            const isOwner = botBase === senderBase || owners.includes(senderBase);

            // Admin check
            let isAdmin = false;
            try {
                const metadata = await conn.groupMetadata(from);
                const participant = metadata.participants.find(p => jidToBase(p.id) === senderBase);
                isAdmin = participant?.admin === "admin" || participant?.admin === "superadmin";
            } catch {
                return reply("❌ Failed to get group information.");
            }

            if (!isOwner && !isAdmin) {
                return reply("❌ Only group admins or owner can toggle welcome messages!");
            }

            const currentStatus = isWelcomeEnabled(from);

            if (!q) {
                return reply(
                    `╭━━〔 🎒 WELCOME STATUS 〕━━┈⊷
┃
┃ 📌 Group: ${from.split('@')[0]}
┃ 📡 Status: ${currentStatus ? '✅ ON' : '❌ OFF'}
┃
┃ 📝 Usage:
┃ .welcome on  - Enable welcome
┃ .welcome off - Disable welcome
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
                );
            }

            if (q.toLowerCase() === "on") {
                setWelcomeEnabled(from, true);
                await conn.sendMessage(from, { react: { text: "✅", key: message.key } });
                return reply(`✅ Welcome messages ENABLED for this group!`);
            }
            
            if (q.toLowerCase() === "off") {
                setWelcomeEnabled(from, false);
                await conn.sendMessage(from, { react: { text: "❌", key: message.key } });
                return reply(`❌ Welcome messages DISABLED for this group!`);
            }
            
            return reply(`⚙️ Usage: .welcome on or .welcome off`);

        } catch (e) {
            console.error("Welcome command error:", e);
            reply("⚠️ Failed to toggle welcome messages.");
        }
    }
};