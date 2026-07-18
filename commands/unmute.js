/**
 * Unmute Command - Open group (all members can send)
 */

module.exports = {
    pattern: "unmute",
    alias: ["open", "opengroup"],
    desc: "Open group (all members can send messages)",
    category: "admin",
    react: "🔓",
    filename: __filename,
    use: ".unmute",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            await conn.groupSettingUpdate(from, 'not_announcement');
            await reply('🔓 Group has been opened!\n\nAll members can send messages now.');

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[unmute] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};