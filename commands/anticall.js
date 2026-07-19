/**
 * Anti-Call Command - Enable or disable anti-call system
 */

const { toggleGroupSetting } = require('../../lib/database');

module.exports = {
    pattern: "anticall",
    alias: [],
    desc: "Enable or disable anti-call system",
    category: "owner",
    react: "📵",
    filename: __filename,
    use: ".anticall on/off",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            if (!args[0]) {
                return reply('Usage: .anticall on/off');
            }

            const option = args[0].toLowerCase();

            if (!['on', 'off'].includes(option)) {
                return reply('Usage: .anticall on/off');
            }

            const enabled = option === 'on';
            await toggleGroupSetting('global', 'anticall', enabled);

            await reply(
                enabled
                    ? '✅ Anti-call enabled. Calls will be auto-rejected & blocked.'
                    : '❌ Anti-call disabled.'
            );

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (err) {
            console.error('[anticall] error:', err);
            reply('❌ Error updating anti-call setting.');
        }
    }
};