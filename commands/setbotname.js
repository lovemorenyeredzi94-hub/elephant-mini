/**
 * Set Bot Name Command - Change bot name
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    pattern: "setbotname",
    alias: ["setname", "botname"],
    desc: "Change bot name",
    category: "owner",
    react: "✏️",
    filename: __filename,
    use: ".setbotname <new name> or reply to a message with .setbotname",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            let newBotName = '';
            
            // Check if message is a reply
            const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg) {
                const quotedText = quotedMsg.conversation || 
                                  quotedMsg.extendedTextMessage?.text || 
                                  quotedMsg.imageMessage?.caption ||
                                  quotedMsg.videoMessage?.caption ||
                                  '';
                newBotName = quotedText.trim();
            } else {
                newBotName = args.join(' ').trim();
            }
            
            if (!newBotName) {
                const currentName = process.env.BOT_NAME || 'QADEER-XD MINI';
                return reply(
                    `📝 *Set Bot Name*\n\n` +
                    `Current bot name: *${currentName}*\n\n` +
                    `Usage:\n` +
                    `  .setbotname <new name>\n` +
                    `  Or reply to a message with .setbotname`
                );
            }
            
            if (newBotName.length > 50) {
                return reply('❌ Bot name must be 50 characters or less!');
            }
            
            // Update environment variable
            process.env.BOT_NAME = newBotName;
            
            await reply(`✅ Bot name changed to: *${newBotName}*\n\nThe new name will be used in menus and other places.`);

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[setbotname] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};