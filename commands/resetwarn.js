/**
 * ResetWarn Command - Reset warnings for a user
 */

const { getWarningsFromDB, clearWarningsFromDB } = require('./lib/database');

module.exports = {
    pattern: "resetwarn",
    alias: ["resetwarning", "clearwarn", "unwarn", "delwarn"],
    desc: "Reset all warnings for a user",
    category: "admin",
    react: "🔄",
    filename: __filename,
    use: ".resetwarn @user",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            let target;
            const ctx = message.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctx?.mentionedJid || [];

            if (mentioned && mentioned.length > 0) {
                target = mentioned[0];
            } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
                target = ctx.participant;
            } else {
                return reply('❌ Please mention or reply to the user to reset warnings!\n\nExample: .resetwarn @user');
            }

            const currentWarnings = await getWarningsFromDB(from, target);

            if (currentWarnings.warningCount === 0) {
                return reply(`✅ @${target.split('@')[0]} has no warnings to reset.`);
            }

            await clearWarningsFromDB(from, target);

            await conn.sendMessage(from, {
                text: `✅ *Warnings Reset*\n\n👤 User: @${target.split('@')[0]}\n⚠️ Previous warnings: ${currentWarnings.warningCount}\n\nAll warnings have been cleared.`,
                mentions: [target]
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[resetwarn] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};