/**
 * Antibadword Command - Detect and delete bad words (delete/kick/warn)
 */

const { getGroupSettingsFromDB, toggleGroupSetting, addWarningToDB, getWarningsFromDB, clearWarningsFromDB } = require('../lib/database');

module.exports = {
    pattern: "antibadword",
    alias: ["antibad", "nobadword"],
    desc: "Configure antibadword protection (delete/kick/warn)",
    category: "admin",
    react: "🚫",
    filename: __filename,
    use: ".antibadword on/off/set/get",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const args = m.args || [];
            if (!args[0]) {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antiBadword ? 'ON' : 'OFF';
                const action = settings?.settings?.badwordAction || 'delete';
                return reply(
                    `🚫 *Antibadword Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Usage:\n` +
                    `  .antibadword on\n` +
                    `  .antibadword off\n` +
                    `  .antibadword set delete | kick | warn\n` +
                    `  .antibadword get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                const settings = await getGroupSettingsFromDB(from);
                if (settings?.settings?.antiBadword) {
                    return reply('*Antibadword is already on*');
                }
                await toggleGroupSetting(from, 'antiBadword', true);
                return reply('*Antibadword has been turned ON*');
            }

            if (opt === 'off') {
                await toggleGroupSetting(from, 'antiBadword', false);
                return reply('*Antibadword has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return reply('*Please specify an action: .antibadword set delete | kick | warn*');
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick', 'warn'].includes(setAction)) {
                    return reply('*Invalid action. Choose delete, kick, or warn.*');
                }
                await toggleGroupSetting(from, 'badwordAction', setAction);
                await toggleGroupSetting(from, 'antiBadword', true);
                return reply(`*Antibadword action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antiBadword ? 'ON' : 'OFF';
                const action = settings?.settings?.badwordAction || 'delete';
                return reply(`*Antibadword Configuration:*\nStatus: ${status}\nAction: ${action}`);
            }

            return reply('*Use .antibadword for usage.*');
        } catch (error) {
            console.error('[antibadword] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};
