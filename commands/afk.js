/**
 * AFK Command — Away From Keyboard (owner offline mode)
 */

const afk = require('../../lib/utils/afk');

module.exports = {
    pattern: "afk",
    alias: ["away"],
    desc: "Enable/disable AFK mode (owner offline auto-reply)",
    category: "owner",
    react: "🔴",
    filename: __filename,
    use: ".afk <on/off> [custom message]",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            const opt = (args[0] || '').toLowerCase();

            if (!opt) {
                const on = afk.isEnabled();
                return reply(
                    `🔴 *AFK Mode*\n\n` +
                    `Status: *${on ? 'ON' : 'OFF'}*\n\n` +
                    `When ON:\n` +
                    `• *Groups* — one-time reply when someone @tags or replies to the bot\n` +
                    `• *DMs* — one-time reply to any message\n` +
                    `Repeated messages from the same person are ignored to avoid spam.\n\n` +
                    `Usage:\n` +
                    `  .afk on\n` +
                    `  .afk on busy right now\n` +
                    `  .afk off`
                );
            }

            if (opt === 'on') {
                if (afk.isEnabled()) {
                    return reply('*AFK is already ON*');
                }
                const customMsg = args.slice(1).join(' ').trim();
                const messageText = customMsg
                    ? `🔴 *AFK Mode ON*\n\n${customMsg}`
                    : afk.DEFAULT_MESSAGE;
                afk.setEnabled(true, messageText);
                return reply('*AFK mode enabled.* Bot will notify taggers/repliers once each.');
            }

            if (opt === 'off') {
                if (!afk.isEnabled()) {
                    return reply('*AFK is already OFF*');
                }
                afk.setEnabled(false);
                return reply('*AFK mode disabled.* You are back online.');
            }

            return reply('❌ Invalid option. Use: .afk on | .afk off');
        } catch (err) {
            console.error('[afk] error:', err);
            return reply('❌ Error updating AFK mode.');
        }
    }
};