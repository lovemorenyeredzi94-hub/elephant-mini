/**
 * AutoSticker Command - Enable or disable auto-sticker conversion
 */

const { getGroupSettingsFromDB, toggleGroupSetting } = require('../../lib/database');

module.exports = {
    pattern: "autosticker",
    alias: ["autos", "asticker"],
    desc: "Enable/disable auto-sticker conversion (images/videos automatically become stickers)",
    category: "admin",
    react: "🎨",
    filename: __filename,
    use: ".autosticker on/off",
    
    execute: async (conn, message, m, { from, isGroup, reply, isAdmin, isOwner }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmin && !isOwner) return reply("❌ Only admins can use this command.");

            const args = m.args || [];
            if (!args[0]) {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.autosticker ? 'ON' : 'OFF';
                return reply(
                    `📌 *AutoSticker Status*\n\n` +
                    `Status: *${status}*\n\n` +
                    `When enabled, all images and videos sent in this group will automatically be converted to stickers.\n\n` +
                    `Usage:\n` +
                    `  .autosticker on\n` +
                    `  .autosticker off`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                const settings = await getGroupSettingsFromDB(from);
                if (settings?.settings?.autosticker) {
                    return reply('*AutoSticker is already ON*');
                }
                await toggleGroupSetting(from, 'autosticker', true);
                return reply('✅ *AutoSticker has been turned ON*\n\nAll images and videos will now automatically be converted to stickers!');
            }

            if (opt === 'off') {
                const settings = await getGroupSettingsFromDB(from);
                if (!settings?.settings?.autosticker) {
                    return reply('*AutoSticker is already OFF*');
                }
                await toggleGroupSetting(from, 'autosticker', false);
                return reply('❌ *AutoSticker has been turned OFF*');
            }

            return reply('❌ Invalid option!\nUsage: .autosticker on/off');
        } catch (error) {
            console.error('[autosticker] error:', error);
            return reply('❌ Error updating autosticker setting.');
        }
    }
};