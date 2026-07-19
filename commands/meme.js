/**
 * Meme Command - Send random memes
 */

const axios = require('axios');

module.exports = {
    pattern: "meme",
    alias: ["memes"],
    desc: "Get random memes",
    category: "fun",
    react: "😂",
    filename: __filename,
    use: ".meme",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const response = await axios.get('https://meme-api.com/gimme');
            const meme = response.data;
            
            const imageResponse = await axios.get(meme.url, { responseType: 'arraybuffer' });
            
            await conn.sendMessage(from, {
                image: Buffer.from(imageResponse.data),
                caption: `😂 *${meme.title}*\n\n📱 From: r/${meme.subreddit}\n👤 By: ${meme.author}\n⬆️ Upvotes: ${meme.ups}`
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[meme] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};