/**
 * Antigroupstatus - Block group status posts in the group
 */

const { getGroupSettingsFromDB, toggleGroupSetting } = require('../../lib/database');

module.exports = {
    pattern: "antigroupstatus",
    alias: ["antigstatus", "ags"],
    desc: "Block group status posts (delete/kick)",
    category: "admin",
    react: "📵",
    filename: __filename,
    use: ".antigroupstatus on/off/set/get",
    
    execute: async (conn, message, m, { from, isGroup, reply, isAdmin, isOwner }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");
            if (!isAdmin && !isOwner) return reply("❌ Only admins can use this command.");

            const args = m.args || [];
            if (!args[0]) {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antigroupstatus ? 'ON' : 'OFF';
                const action = settings?.settings?.antigroupstatusAction || 'delete';
                return reply(
                    `📵 *Anti Group Status*\n\n` +
                    `Status: *${status}*\n` +
                    `Action: *${action}*\n\n` +
                    `Blocks members from posting WhatsApp group statuses.\n\n` +
                    `Usage:\n` +
                    `  .antigroupstatus on\n` +
                    `  .antigroupstatus off\n` +
                    `  .antigroupstatus set delete | kick\n` +
                    `  .antigroupstatus get`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                const settings = await getGroupSettingsFromDB(from);
                if (settings?.settings?.antigroupstatus) {
                    return reply('*Anti group status is already on*');
                }
                await toggleGroupSetting(from, 'antigroupstatus', true);
                return reply('*Anti group status has been turned ON*');
            }

            if (opt === 'off') {
                await toggleGroupSetting(from, 'antigroupstatus', false);
                return reply('*Anti group status has been turned OFF*');
            }

            if (opt === 'set') {
                if (args.length < 2) {
                    return reply('*Usage: .antigroupstatus set delete | kick*');
                }
                const setAction = args[1].toLowerCase();
                if (!['delete', 'kick'].includes(setAction)) {
                    return reply('*Invalid action. Choose delete or kick.*');
                }
                await toggleGroupSetting(from, 'antigroupstatusAction', setAction);
                await toggleGroupSetting(from, 'antigroupstatus', true);
                return reply(`*Anti group status action set to ${setAction}*`);
            }

            if (opt === 'get') {
                const settings = await getGroupSettingsFromDB(from);
                const status = settings?.settings?.antigroupstatus ? 'ON' : 'OFF';
                const action = settings?.settings?.antigroupstatusAction || 'delete';
                return reply(`*Anti Group Status Config:*\nStatus: ${status}\nAction: ${action}`);
            }

            return reply('*Use .antigroupstatus for usage.*');
        } catch (error) {
            console.error('[antigroupstatus] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};