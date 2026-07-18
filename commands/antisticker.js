/**
 * Antisticker Command - Toggle antisticker protection
 */

const { getGroupSettingsFromDB, toggleGroupSetting } = require('./lib/database');

module.exports = {
    pattern: "antisticker",
    alias: ["nosticker"],
    desc: "Configure antisticker protection (stickers not allowed)",
    category: "admin",
    react: "🖼️",
    filename: __filename,
    use: ".antisticker on/off/set/get",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const args = m.args || [];
            if (!args[0]) {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antiSticker ? 'ON' : 'OFF';
                const action = settings?.settings?.antiStickerAction || 'delete';
                return reply(
                    `🖼️ *Antisticker Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Stickers will be deleted when sent.\n\n` +
                    `Usage:\n` +
                    `  .antisticker on\n` +
                    `  .antisticker off\n` +
                    `  .antisticker set delete | kick\n` +
                    `  .antisticker get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                const settings = await getGroupSettingsFromDB(from);
                if (settings?.settings?.antiSticker) {
                    return reply('*Antisticker is already on*');
                }
                await toggleGroupSetting(from, 'antiSticker', true);
                return reply('*Antisticker has been turned ON* - Stickers will be deleted.');
            }

            if (opt === 'off') {
                await toggleGroupSetting(from, 'antiSticker', false);
                return reply('*Antisticker has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return reply('*Please specify an action: .antisticker set delete | kick*');
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return reply('*Invalid action. Choose delete or kick.*');
                }
                await toggleGroupSetting(from, 'antiStickerAction', setAction);
                await toggleGroupSetting(from, 'antiSticker', true);
                return reply(`*Antisticker action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antiSticker ? 'ON' : 'OFF';
                const action = settings?.settings?.antiStickerAction || 'delete';
                return reply(`*Antisticker Configuration:*\nStatus: ${status}\nAction: ${action}`);
            }

            return reply('*Use .antisticker for usage.*');
        } catch (error) {
            console.error('[antisticker] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};