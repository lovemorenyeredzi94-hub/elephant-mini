/**
 * Clean Command - Delete messages in group
 */

module.exports = {
    pattern: "clean",
    alias: ["purge", "clear"],
    desc: "Clean messages (all or from specific user if replied)",
    category: "admin",
    react: "🧹",
    filename: __filename,
    use: ".clean <number>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isAdmin, isOwner }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmin && !isOwner) return reply("❌ Only admins can use this command.");

            const args = m.args || [];
            const count = parseInt(args[0]);
            if (!count || count < 1 || count > 100) {
                return reply('❌ Please enter a valid number (1-100).');
            }

            const ctx = message.message?.extendedTextMessage?.contextInfo;
            const quotedParticipant = ctx?.participant;
            const store = global.store || { messages: {} };

            const msgs = store.messages[from];
            if (!msgs) {
                return reply('❌ No stored messages found.');
            }

            let messagesToDelete = [];

            if (quotedParticipant) {
                messagesToDelete = Object.values(msgs)
                    .filter(m => {
                        const sender = m.key.participant || m.key.remoteJid;
                        return sender === quotedParticipant;
                    })
                    .sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0))
                    .slice(0, count);
            } else {
                messagesToDelete = Object.values(msgs)
                    .sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0))
                    .slice(0, count);
            }

            let deleted = 0;
            for (const msg of messagesToDelete) {
                try {
                    await conn.sendMessage(from, { delete: msg.key });
                    deleted++;
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (err) {
                    console.error('[clean] delete error:', err.message);
                }
            }

            await reply(`✅ Deleted ${deleted} messages.`);

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[clean] error:', error);
            await reply('❌ Failed to clean messages.');
        }
    }
};