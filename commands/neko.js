/**
 * Neko Command - Get random neko anime images
 */

const axios = require('axios');

module.exports = {
    pattern: "neko",
    alias: ["nekosfw"],
    desc: "Get random neko SFW anime images",
    category: "anime",
    react: "🐱",
    filename: __filename,
    use: ".neko",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const url = 'https://api.princetechn.com/api/anime/neko?apikey=prince';
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                },
                timeout: 30000
            });
            
            if (!response.data || !response.data.result) {
                throw new Error('Invalid API response: missing image URL');
            }
            
            const imageUrl = response.data.result;
            
            if (!imageUrl || typeof imageUrl !== 'string') {
                throw new Error('Invalid image URL in API response');
            }
            
            const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'image/*'
                },
                timeout: 30000
            });
            
            const imageBuffer = Buffer.from(imageResponse.data);
            
            if (!imageBuffer || imageBuffer.length === 0) {
                throw new Error('Empty image response');
            }
            
            await conn.sendMessage(from, {
                image: imageBuffer
            }, { quoted: message });
            
            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[neko] error:', error);
            
            if (error.response?.status === 404) {
                await reply('❌ Image not found. Please try again.');
            } else if (error.response?.status === 429) {
                await reply('❌ Rate limit exceeded. Please try again later.');
            } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                await reply('❌ Request timed out. Please try again.');
            } else {
                await reply(`❌ Failed to fetch neko image: ${error.message}`);
            }
        }
    }
};