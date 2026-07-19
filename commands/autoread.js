/**
 * AutoRead Command - Read messages immediately when received
 */

const { load, save, isEnabled } = require('../../lib/utils/autoread');

module.exports = {
    pattern: "autoread",
    alias: ["aread"],
    desc: "Read messages immediately when received (owner only)",
    category: "owner",
    react: "📖",
    filename: __filename,
    use: ".autoread <on/off>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            if (!args[0]) {
                const on = isEnabled();
                return reply(
                    `📖 *AutoRead*\n\n` +
                    `Status: *${on ? 'ON' : 'OFF'}*\n\n` +
                    `When ON, the bot marks all incoming messages (groups & DMs) as read immediately.\n\n` +
                    `Usage:\n` +
                    `  .autoread on\n` +
                    `  .autoread off`
                );
            }

            const opt = args[0].toLowerCase();

            if (opt === 'on') {
                save(true);
                return reply('✅ *AutoRead is ON*. Bot will read messages immediately.');
            }

            if (opt === 'off') {
                save(false);
                return reply('❌ *AutoRead is OFF*.');
            }

            return reply('❌ Invalid option. Use: .autoread <on/off>');
        } catch (err) {
            console.error('[autoread] error:', err);
            return reply('❌ Error updating autoread.');
        }
    }
};