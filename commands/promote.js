/**
 * Promote Command - Make member admin
 */

module.exports = {
    pattern: "promote",
    alias: ["makeadmin"],
    desc: "Promote member to admin",
    category: "admin",
    react: "⬆️",
    filename: __filename,
    use: ".promote @user",
    
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
                return reply('❌ Please mention or reply to the user to promote!\n\nExample: .promote @user');
            }

            const freshMetadata = await conn.groupMetadata(from);
            const foundParticipant = freshMetadata.participants.find(p => p.id === target);

            if (!foundParticipant) {
                return reply('❌ User not found in group!');
            }

            if (foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin') {
                return reply('❌ This user is already an admin!');
            }

            await conn.groupParticipantsUpdate(from, [target], 'promote');

            await conn.sendMessage(from, {
                text: `✅ @${target.split('@')[0]} is now an admin!`,
                mentions: [target]
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[promote] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};