/**
 * Menu Command - Display all available commands
 */

const fs = require('fs');
const path = require('path');

// ============================================
// FAKE VCARD QUOTED MESSAGE
// ============================================
const fakeVCardQuoted = {
    key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast"
    },
    message: {
        contactMessage: {
            displayName: "QADEER-XD MINI",
            vcard: `BEGIN:VCARD
VERSION:3.0
FN: QADEER-XD MINI
ORG:QADEER-XD Official;
TEL;type=CELL;type=VOICE;waid=1234567890:+1234567890
END:VCARD`
        }
    }
};

module.exports = {
    pattern: "menu",
    alias: ["help", "commands"],
    desc: "Show all available commands",
    category: "general",
    react: "📋",
    filename: __filename,
    use: ".menu",
    
    execute: async (conn, message, m, { from, isGroup, reply, sender, isOwner }) => {
        try {
            // Get all commands from global
            const commands = global.commands || new Map();
            const categories = {};
            
            // Group commands by category
            for (const [name, cmd] of commands) {
                // Skip aliases (only show main commands)
                if (cmd.pattern && cmd.pattern !== name) continue;
                if (cmd.name && cmd.name !== name) continue;
                
                const category = cmd.category || 'general';
                if (!categories[category]) {
                    categories[category] = [];
                }
                categories[category].push({
                    name: name,
                    aliases: cmd.alias || cmd.aliases || [],
                    category: category,
                    desc: cmd.desc || cmd.description || '',
                    ownerOnly: cmd.ownerOnly || false
                });
            }

            const BOT_NAME = process.env.BOT_NAME || "QADEER-XD MINI";
            const OWNER_NAME = process.env.OWNER_NAME || "SILVER xZAMAN";
            const PREFIX = process.env.PREFIX || ".";
            
            // ============================================
            // BUILD MENU
            // ============================================
            let menuText = `╭─────────────────◇\n`;
            menuText += `│  🐘 *${BOT_NAME.toUpperCase()}*   \n`;
            menuText += `│  ✦ Multi-Device WhatsApp Bot  \n`;
            menuText += `╰─────────────────○\n\n`;
            
            // Greeting
            menuText += `┌─────────────────┐\n`;
            menuText += `│  👋 Hello @${sender.split('@')[0]}!  \n`;
            menuText += `└─────────────────┘\n\n`;
            
            // Bot Info
            menuText += `┌─────────────────┐\n`;
            menuText += `│  📊 *BOT INFO*          \n`;
            menuText += `├─────────────────┤\n`;
            menuText += `│  ⚡ Prefix  : ${PREFIX}     \n`;
            menuText += `│  📦 Commands: ${commands.size}    \n`;
            menuText += `│  👑 Owner   : ${OWNER_NAME} \n`;
            menuText += `└─────────────────┘\n\n`;
            
            // ============================================
            // COMMANDS BY CATEGORY
            // ============================================
            menuText += `┌─────────────────┐\n`;
            menuText += `│  📋 *COMMANDS*        \n`;
            menuText += `└─────────────────┘\n\n`;
            
            // Category config
            const categoryConfig = {
                general: { emoji: '🧭', label: 'GENERAL' },
                ai: { emoji: '🤖', label: 'AI' },
                group: { emoji: '👥', label: 'GROUP' },
                admin: { emoji: '🛡️', label: 'ADMIN' },
                owner: { emoji: '👑', label: 'OWNER' },
                media: { emoji: '🎬', label: 'MEDIA' },
                fun: { emoji: '🎮', label: 'FUN' },
                economy: { emoji: '💰', label: 'ECONOMY' },
                utility: { emoji: '🔧', label: 'UTILITY' },
                anime: { emoji: '🎌', label: 'ANIME' },
                textmaker: { emoji: '✍️', label: 'TEXTMAKER' }
            };
            
            // Category order
            const categoryOrder = [
                'general', 'ai', 'group', 'admin', 'owner',
                'media', 'fun', 'economy', 'utility',
                'anime', 'textmaker'
            ];
            
            for (const catName of categoryOrder) {
                if (!categories[catName] || categories[catName].length === 0) continue;
                
                const cat = categoryConfig[catName] || { emoji: '📌', label: catName.toUpperCase() };
                
                menuText += `┌─────────────────┐\n`;
                menuText += `│  ${cat.emoji} *${cat.label}*      \n`;
                menuText += `├─────────────────┤\n`;
                
                // Sort commands alphabetically
                const sortedCmds = categories[catName].sort((a, b) => a.name.localeCompare(b.name));
                
                for (const cmd of sortedCmds) {
                    // Skip owner-only commands if not owner
                    if (cmd.ownerOnly && !isOwner) continue;
                    
                    let cmdLine = `│  ${PREFIX}${cmd.name}`;
                    if (cmd.aliases && cmd.aliases.length > 0) {
                        cmdLine += ` (${cmd.aliases.join(', ')})`;
                    }
                    // Pad to align
                    const maxLen = 24;
                    const padding = maxLen - cmdLine.length;
                    if (padding > 0) {
                        cmdLine += ' '.repeat(padding);
                    }
                    cmdLine += '│';
                    menuText += cmdLine + '\n';
                }
                
                menuText += `└─────────────────┘\n\n`;
            }
            
            // ============================================
            // TIPS SECTION
            // ============================================
            menuText += `┌─────────────────┐\n`;
            menuText += `│  💡 *TIPS*             \n`;
            menuText += `├─────────────────┤\n`;
            menuText += `│  📌 ${PREFIX}help <cmd>   \n`;
            menuText += `│  📌 ${PREFIX}menu       \n`;
            menuText += `│  📌 ${PREFIX}ping        \n`;
            menuText += `└─────────────────┘\n\n`;
            
            // ============================================
            // FOOTER
            // ============================================
            menuText += `╰─────────────────◇\n`;
            menuText += `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${OWNER_NAME} • ${BOT_NAME}*\n`;
            
            // ============================================
            // SEND MENU
            // ============================================
            const imagePath = path.join(__dirname, '../utils/bot_image.jpg');
            
            if (fs.existsSync(imagePath)) {
                const imageBuffer = fs.readFileSync(imagePath);
                await conn.sendMessage(from, {
                    image: imageBuffer,
                    caption: menuText,
                    mentions: [sender],
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363161513685998@newsletter',
                            newsletterName: BOT_NAME,
                            serverMessageId: -1
                        }
                    }
                }, {
                    quoted: message
                });
            } else {
                await conn.sendMessage(from, {
                    text: menuText,
                    mentions: [sender]
                }, {
                    quoted: message
                });
            }
            
        } catch (error) {
            console.error('Menu error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};
