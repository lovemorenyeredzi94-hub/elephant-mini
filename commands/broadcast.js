/**
 * Broadcast Command - Send message to all chats
 */

module.exports = {
    pattern: "broadcast",
    alias: ["bc"],
    desc: "Broadcast message to all chats",
    category: "owner",
    react: "📢",
    filename: __filename,
    use: ".broadcast <message>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            if (args.length === 0) {
                return reply('❌ Usage: .broadcast <message>\n\nExample: .broadcast Hello everyone!');
            }
            
            const msgText = args.join(' ');
            
            const chats = await conn.groupFetchAllParticipating();
            const groups = Object.values(chats);
            
            let success = 0;
            let failed = 0;
            
            for (const group of groups) {
                try {
                    await conn.sendMessage(group.id, {
                        text: `📢 *BROADCAST MESSAGE*\n\n${msgText}\n\n_This is a broadcast message from bot owner_`
                    });
                    success++;
                } catch (e) {
                    failed++;
                }
            }
            
            await reply(`✅ Broadcast complete!\n\n✅ Success: ${success}\n❌ Failed: ${failed}`);

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[broadcast] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};