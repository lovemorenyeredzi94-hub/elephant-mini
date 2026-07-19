/**
 * Mode Command - Toggle bot between private and public mode
 */

module.exports = {
    pattern: "mode",
    alias: ["botmode", "privatemode", "publicmode"],
    desc: "Toggle bot between private and public mode",
    category: "owner",
    react: "🔒",
    filename: __filename,
    use: ".mode <private/public>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            const currentMode = process.env.SELF_MODE === 'true' ? 'private' : 'public';
            
            if (!args[0]) {
                return reply(
                    `🤖 *Bot Mode*\n\n` +
                    `Current Mode: *${currentMode.toUpperCase()}*\n\n` +
                    `Usage:\n` +
                    `  .mode private - Only owner and sudo can use\n` +
                    `  .mode public - Everyone can use`
                );
            }
            
            const mode = args[0].toLowerCase();
            
            if (mode === 'private' || mode === 'priv') {
                process.env.SELF_MODE = 'true';
                return reply('🔒 Bot mode changed to *PRIVATE*\n\nOnly owner and sudo can use commands now.');
            }
            
            if (mode === 'public' || mode === 'pub') {
                process.env.SELF_MODE = 'false';
                return reply('🌐 Bot mode changed to *PUBLIC*\n\nEveryone can use commands now.');
            }
            
            return reply('❌ Invalid mode!\nUsage: .mode <private/public>');
        } catch (error) {
            console.error('[mode] error:', error);
            await reply('❌ Error changing bot mode.');
        }
    }
};