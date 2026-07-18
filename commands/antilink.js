/**
 * Antilink Command - Toggle antilink protection
 */

const { getGroupSettingsFromDB, toggleGroupSetting } = require('./lib/database');

module.exports = {
    pattern: "antilink",
    alias: [],
    desc: "Configure antilink protection (delete/kick)",
    category: "admin",
    react: "🔗",
    filename: __filename,
    use: ".antilink on/off/set/get",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const args = m.args || [];
            if (!args[0]) {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antiLink ? 'ON' : 'OFF';
                const action = settings?.settings?.antiLinkAction || 'delete';
                return reply(
                    `🔗 *Antilink Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Usage:\n` +
                    `  .antilink on\n` +
                    `  .antilink off\n` +
                    `  .antilink set delete | kick\n` +
                    `  .antilink get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                const settings = await getGroupSettingsFromDB(from);
                if (settings?.settings?.antiLink) {
                    return reply('*Antilink is already on*');
                }
                await toggleGroupSetting(from, 'antiLink', true);
                return reply('*Antilink has been turned ON*');
            }

            if (opt === 'off') {
                await toggleGroupSetting(from, 'antiLink', false);
                return reply('*Antilink has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return reply('*Please specify an action: .antilink set delete | kick*');
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return reply('*Invalid action. Choose delete or kick.*');
                }
                await toggleGroupSetting(from, 'antiLinkAction', setAction);
                await toggleGroupSetting(from, 'antiLink', true);
                return reply(`*Antilink action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antiLink ? 'ON' : 'OFF';
                const action = settings?.settings?.antiLinkAction || 'delete';
                return reply(`*Antilink Configuration:*\nStatus: ${status}\nAction: ${action}`);
            }

            return reply('*Use .antilink for usage.*');
        } catch (error) {
            console.error('[antilink] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};