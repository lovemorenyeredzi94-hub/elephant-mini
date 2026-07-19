/**
 * Sudo Command - Add/remove sudo users
 */

const database = require('../../lib/database');

const normalizeNumber = (input) => {
    return String(input).replace(/\D/g, '');
};

const toJid = (input) => {
    const s = String(input).trim();
    if (!s) return null;
    if (s.includes('@')) return s;
    const n = normalizeNumber(s);
    return n && n.length >= 10 ? `${n}@s.whatsapp.net` : null;
};

function extractMentionedJid(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned[0];
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const match = text.match(/\b(\d{7,15})\b/);
    if (match) return match[1] + '@s.whatsapp.net';
    return null;
}

module.exports = {
    pattern: "sudo",
    alias: ["sudouser"],
    desc: "Add or remove sudo users (owner-like privileges)",
    category: "owner",
    react: "🔐",
    filename: __filename,
    use: ".sudo add @user | .sudo remove @user | .sudo list",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner, groupMetadata }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];

            if (!args[0]) {
                const sudoJids = database.getSudoUsers();
                let listText = '_No sudo users_';
                const mentionJids = [];
                const lines = [];

                if (sudoJids.length > 0) {
                    for (let i = 0; i < sudoJids.length; i++) {
                        const jid = sudoJids[i];
                        const user = jid.split('@')[0];
                        lines.push(`${i + 1}. @${user}`);
                        mentionJids.push(jid);
                    }
                    listText = lines.join('\n');
                }

                const text =
                    `🔐 *Sudo Users*\n\n` +
                    `Sudo users have owner-like privileges (can use owner commands in private mode).\n\n` +
                    `*Usage:*\n` +
                    `  .sudo add @user - Add sudo (mention user)\n` +
                    `  .sudo add <number> - Add sudo by number\n` +
                    `  .sudo remove @user - Remove sudo (mention user)\n` +
                    `  .sudo list - List all sudo users\n\n` +
                    `*Current sudo users:*\n${listText}`;

                await conn.sendMessage(from, { text, mentions: mentionJids }, { quoted: message });
                return;
            }

            const action = args[0].toLowerCase();
            let inputJid = args[1] ? toJid(args[1]) : null;

            if (!inputJid && (action === 'add' || action === 'remove')) {
                const ctx = message.message?.extendedTextMessage?.contextInfo;
                const quotedParticipant = ctx?.participant;
                if (quotedParticipant) {
                    inputJid = quotedParticipant;
                } else {
                    inputJid = extractMentionedJid(message);
                }
                if (!inputJid && !isGroup && message.key?.remoteJid?.includes('@')) {
                    inputJid = message.key.remoteJid;
                }
            }

            if (action === 'add' || action === 'a') {
                if (!inputJid || !inputJid.includes('@')) {
                    return reply('❌ Please mention a user (@user), provide a number, or reply to a message.\nExample: .sudo add @user or .sudo add 919876543210');
                }

                const user = inputJid.split('@')[0];

                if (database.addSudoUser(inputJid)) {
                    await conn.sendMessage(from, {
                        text: `✅ @${user} has been added as sudo user.`,
                        mentions: [inputJid]
                    }, { quoted: message });
                } else {
                    await conn.sendMessage(from, {
                        text: `ℹ️ @${user} is already a sudo user.`,
                        mentions: [inputJid]
                    }, { quoted: message });
                }
                return;
            }

            if (action === 'remove' || action === 'rem' || action === 'del' || action === 'r') {
                if (!inputJid || !inputJid.includes('@')) {
                    return reply('❌ Please mention a user (@user), provide a number, or reply to a message.\nExample: .sudo remove @user or .sudo remove 919876543210');
                }

                const user = inputJid.split('@')[0];
                const ownerJids = (process.env.OWNER_NUMBER || '').split(',').map((n) => `${n.trim()}@s.whatsapp.net`);
                if (ownerJids.some((oj) => oj.split('@')[0] === user)) {
                    return reply('❌ Owner cannot be removed from sudo.');
                }

                if (database.removeSudoUser(inputJid)) {
                    await conn.sendMessage(from, {
                        text: `✅ @${user} has been removed from sudo users.`,
                        mentions: [inputJid]
                    }, { quoted: message });
                } else {
                    await conn.sendMessage(from, {
                        text: `ℹ️ @${user} was not in the sudo list.`,
                        mentions: [inputJid]
                    }, { quoted: message });
                }
                return;
            }

            if (action === 'list' || action === 'l') {
                const sudoJids = database.getSudoUsers();
                let listText = '_No sudo users_';
                const mentionJids = [];
                const lines = [];

                if (sudoJids.length > 0) {
                    for (let i = 0; i < sudoJids.length; i++) {
                        const jid = sudoJids[i];
                        const user = jid.split('@')[0];
                        lines.push(`${i + 1}. @${user}`);
                        mentionJids.push(jid);
                    }
                    listText = lines.join('\n');
                }

                const text = `🔐 *Sudo Users List*\n\n${listText}`;
                await conn.sendMessage(from, { text, mentions: mentionJids }, { quoted: message });
                return;
            }

            return reply('❌ Invalid action!\nUsage: .sudo add/remove/list <number>');
        } catch (error) {
            console.error('[sudo] error:', error);
            await reply('❌ Error executing sudo command.');
        }
    }
};