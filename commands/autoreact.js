/**
 * Auto-React Command - Configure automatic reactions
 */

const { load, save } = require('../../lib/utils/autoReact');

module.exports = {
    pattern: "autoreact",
    alias: ["ar"],
    desc: "Configure automatic reactions to messages",
    category: "owner",
    react: "⚡",
    filename: __filename,
    use: ".autoreact <on/off/set bot/set all>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            if (!args[0]) {
                return reply('📋 *Auto-React Options:*\n\n• on - Enable auto-react\n• off - Disable auto-react\n• set bot - React only to bot commands\n• set all - React to all messages');
            }

            const db = load();
            const opt = args.join(' ').toLowerCase();

            if (opt === 'on') {
                db.enabled = true;
                save(db);
                return reply('✅ Auto-react enabled.');
            }

            if (opt === 'off') {
                db.enabled = false;
                save(db);
                return reply('❌ Auto-react disabled.');
            }

            if (opt === 'set bot') {
                db.mode = 'bot';
                save(db);
                return reply('🤖 Auto-react mode: Bot commands only (⏳ reaction)');
            }

            if (opt === 'set all') {
                db.mode = 'all';
                save(db);
                return reply('🌟 Auto-react mode: All messages (random emojis)');
            }

            reply('❌ Invalid option. Use: on | off | set bot | set all');
        } catch (err) {
            console.error('[autoreact] error:', err);
            reply('❌ Error configuring auto-react.');
        }
    }
};