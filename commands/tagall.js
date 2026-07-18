/**
 * Tag All Command - Mention all group members
 */

module.exports = {
    pattern: "tagall",
    alias: ["mentionall", "everyone"],
    desc: "Tag all group members",
    category: "admin",
    react: "📢",
    filename: __filename,
    use: ".tagall <message>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const args = m.args || [];
            const msgText = args.join(' ') || 'Everyone!';

            const groupMetadata = await conn.groupMetadata(from);
            const participants = groupMetadata.participants.map(p => p.id);

            let text = `📢 *GROUP ANNOUNCEMENT*\n\n`;
            text += `${msgText}\n\n`;
            text += `👥 Tagged Members:\n`;

            participants.forEach((participant, index) => {
                text += `${index + 1}. @${participant.split('@')[0]}\n`;
            });

            await conn.sendMessage(from, {
                text,
                mentions: participants
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[tagall] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};