/**
 * AntiTag Command - Enable/disable anti-tag
 */

const { getGroupSettingsFromDB, toggleGroupSetting } = require('./lib/database');

module.exports = {
    pattern: "antitag",
    alias: ["antimention", "at"],
    desc: "Configure anti-tag protection (tagall/hidetag)",
    category: "admin",
    react: "📛",
    filename: __filename,
    use: ".antitag on/off/set/get",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const args = m.args || [];
            if (!args[0]) {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antitag ? 'ON' : 'OFF';
                const action = settings?.settings?.antitagAction || 'delete';
                return reply(
                    `📛 Anti-tag is *${status}* (action: *${action}*).\n` +
                    'Usage:\n' +
                    '  .antitag on\n' +
                    '  .antitag off\n' +
                    '  .antitag set delete | kick\n' +
                    '  .antitag get'
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                const settings = await getGroupSettingsFromDB(from);
                if (settings?.settings?.antitag) {
                    return reply('*Antitag is already on*');
                }
                await toggleGroupSetting(from, 'antitag', true);
                return reply('*Antitag has been turned ON*');
            }

            if (opt === 'off') {
                await toggleGroupSetting(from, 'antitag', false);
                return reply('*Antitag has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return reply('*Please specify an action: .antitag set delete | kick*');
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return reply('*Invalid action. Choose delete or kick.*');
                }
                await toggleGroupSetting(from, 'antitagAction', setAction);
                await toggleGroupSetting(from, 'antitag', true);
                return reply(`*Antitag action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antitag ? 'ON' : 'OFF';
                const action = settings?.settings?.antitagAction || 'delete';
                return reply(`*Antitag Configuration:*\nStatus: ${status}\nAction: ${action}`);
            }

            return reply('*Use .antitag for usage.*');
        } catch (error) {
            console.error('[antitag] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};