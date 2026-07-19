/**
 * Unblock Command - Unblock a user
 */

module.exports = {
    pattern: "unblock",
    alias: [],
    desc: "Unblock a user",
    category: "owner",
    react: "✅",
    filename: __filename,
    use: ".unblock @user or reply",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            let target;
            const ctx = message.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctx?.mentionedJid || [];
            
            if (mentioned && mentioned.length > 0) {
                target = mentioned[0];
            } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
                target = ctx.participant;
            } else {
                return reply('❌ Please mention or reply to a user to unblock!');
            }
            
            await conn.updateBlockStatus(target, 'unblock');
            
            await conn.sendMessage(from, {
                text: `✅ @${target.split('@')[0]} has been unblocked!`,
                mentions: [target]
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[unblock] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};