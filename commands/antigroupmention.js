/**
 * Anti-Group Mention Command - Toggle antigroupmention protection
 */

const { getGroupSettingsFromDB, toggleGroupSetting } = require('./lib/database');

module.exports = {
    pattern: "antigroupmention",
    alias: ["agm"],
    desc: "Configure antigroupmention protection (delete/kick)",
    category: "admin",
    react: "📌",
    filename: __filename,
    use: ".antigroupmention on/off/set/get",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const args = m.args || [];
            if (!args[0]) {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antigroupmention ? 'ON' : 'OFF';
                const action = settings?.settings?.antigroupmentionAction || 'delete';
                return reply(
                    `📌 *Antigroupmention Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Usage:\n` +
                    `  .antigroupmention on\n` +
                    `  .antigroupmention off\n` +
                    `  .antigroupmention set delete | kick\n` +
                    `  .antigroupmention get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                const settings = await getGroupSettingsFromDB(from);
                if (settings?.settings?.antigroupmention) {
                    return reply('*Antigroupmention is already on*');
                }
                await toggleGroupSetting(from, 'antigroupmention', true);
                return reply('*Antigroupmention has been turned ON*');
            }

            if (opt === 'off') {
                await toggleGroupSetting(from, 'antigroupmention', false);
                return reply('*Antigroupmention has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return reply('*Please specify an action: .antigroupmention set delete | kick*');
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return reply('*Invalid action. Choose delete or kick.*');
                }
                await toggleGroupSetting(from, 'antigroupmentionAction', setAction);
                await toggleGroupSetting(from, 'antigroupmention', true);
                return reply(`*Antigroupmention action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antigroupmention ? 'ON' : 'OFF';
                const action = settings?.settings?.antigroupmentionAction || 'delete';
                return reply(`*Antigroupmention Configuration:*\nStatus: ${status}\nAction: ${action}`);
            }

            return reply('*Use .antigroupmention for usage.*');
        } catch (error) {
            console.error('[antigroupmention] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};