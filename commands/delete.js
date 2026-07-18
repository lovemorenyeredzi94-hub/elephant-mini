/**
 * Delete Command - Delete a replied message
 */

module.exports = {
    pattern: "delete",
    alias: ["del"],
    desc: "Delete a replied message",
    category: "admin",
    react: "🗑️",
    filename: __filename,
    use: ".delete (reply to a message)",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const ctx = message.message?.extendedTextMessage?.contextInfo;

            if (!ctx?.stanzaId || !ctx?.participant) {
                return reply('🗑️ Reply to the message you want to delete.');
            }

            const deleteKey = {
                remoteJid: from,
                id: ctx.stanzaId,
                participant: ctx.participant
            };

            await conn.sendMessage(from, { delete: deleteKey });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[delete] error:', error);
            await reply('❌ Failed to delete message.');
        }
    }
};