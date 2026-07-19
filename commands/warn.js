/**
 * Warn Command - Warn a user
 */

const { addWarningToDB, getWarningsFromDB, clearWarningsFromDB, getGroupSettingsFromDB } = require('../../lib/database');

module.exports = {
    pattern: "warn",
    alias: ["warning"],
    desc: "Warn a user",
    category: "admin",
    react: "⚠️",
    filename: __filename,
    use: ".warn @user <reason>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isAdmin, isOwner, groupMetadata, isBotAdmin }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmin && !isOwner) return reply("❌ Only admins can use this command.");

            let target;
            const ctx = message.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctx?.mentionedJid || [];
            const args = m.args || [];

            if (mentioned && mentioned.length > 0) {
                target = mentioned[0];
            } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
                target = ctx.participant;
            } else {
                return reply('❌ Please mention or reply to the user to warn!\n\nExample: .warn @user Breaking rules');
            }

            const reason = args.slice(mentioned.length > 0 ? 1 : 0).join(' ') || 'No reason specified';

            const foundParticipant = groupMetadata?.participants?.find(
                p => p.id === target && (p.admin === 'admin' || p.admin === 'superadmin')
            );

            if (foundParticipant) {
                return reply('❌ Cannot warn an admin!');
            }

            const settings = await getGroupSettingsFromDB(from);
            const maxWarnings = settings?.settings?.maxWarnings || 3;

            const warnings = await addWarningToDB(from, target, reason);

            let text = `⚠️ *USER WARNING*\n\n`;
            text += `👤 User: @${target.split('@')[0]}\n`;
            text += `📝 Reason: ${reason}\n`;
            text += `⚠️ Warnings: ${warnings.warningCount}/${maxWarnings}\n\n`;

            if (warnings.warningCount >= maxWarnings) {
                text += `❌ User has reached maximum warnings and will be removed!`;

                await conn.sendMessage(from, {
                    text,
                    mentions: [target]
                }, { quoted: message });

                if (isBotAdmin) {
                    await conn.groupParticipantsUpdate(from, [target], 'remove');
                    await clearWarningsFromDB(from, target);
                }
            } else {
                text += `⚠️ Next warning will result in removal!`;
                await conn.sendMessage(from, {
                    text,
                    mentions: [target]
                }, { quoted: message });
            }

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[warn] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};