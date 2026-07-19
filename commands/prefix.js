/**
 * Set Prefix Command - Change bot command prefix
 */

module.exports = {
    pattern: "setprefix",
    alias: ["prefix"],
    desc: "Change bot command prefix",
    category: "owner",
    react: "📌",
    filename: __filename,
    use: ".setprefix <new prefix>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            const currentPrefix = process.env.PREFIX || '.';
            
            if (args.length === 0) {
                return reply(`📌 Current prefix: ${currentPrefix}\n\nUsage: .setprefix <new prefix>`);
            }
            
            const newPrefix = args[0];
            
            if (newPrefix.length > 3) {
                return reply('❌ Prefix must be 1-3 characters long!');
            }
            
            process.env.PREFIX = newPrefix;
            
            await reply(`✅ Prefix changed to: ${newPrefix}\n\nNew command format: ${newPrefix}command`);

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[setprefix] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};