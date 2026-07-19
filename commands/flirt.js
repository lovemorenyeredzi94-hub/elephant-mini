/**
 * Flirt - Get a random flirty message from API
 */

const axios = require('axios');

module.exports = {
    pattern: "flirt",
    alias: ["pickup", "pickupline"],
    desc: "Get a random flirty pickup line",
    category: "fun",
    react: "😘",
    filename: __filename,
    use: ".flirt [@user]",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const response = await axios.get('https://api.shizo.top/quote/flirt?apikey=shizo');
            
            if (!response.data || !response.data.status || !response.data.result) {
                throw new Error('Invalid API response');
            }
            
            const flirtText = response.data.result;
            const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            
            if (mentioned.length > 0) {
                await conn.sendMessage(from, {
                    text: flirtText,
                    mentions: mentioned
                }, { quoted: message });
            } else {
                await reply(flirtText);
            }

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[flirt] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};