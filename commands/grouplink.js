/**
 * Group Link Command - Get group invite link
 */

module.exports = {
    pattern: "grouplink",
    alias: ["link", "invite"],
    desc: "Get group invite link",
    category: "admin",
    react: "🔗",
    filename: __filename,
    use: ".grouplink",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const code = await conn.groupInviteCode(from);
            const link = `https://chat.whatsapp.com/${code}`;

            const groupMetadata = await conn.groupMetadata(from);

            let text = `🔗 *GROUP INVITE LINK*\n\n`;
            text += `📱 Group: ${groupMetadata.subject}\n`;
            text += `🔗 Link: ${link}\n\n`;
            text += `⚠️ Don't share this link publicly!`;

            await reply(text);

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[grouplink] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};