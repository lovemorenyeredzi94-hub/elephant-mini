/**
 * Random Command - Get random anime data
 */

const axios = require('axios');

module.exports = {
    pattern: "random",
    alias: ["animerandom", "randomanime"],
    desc: "Get random anime data",
    category: "anime",
    react: "🎲",
    filename: __filename,
    use: ".random",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const url = 'https://api.princetechn.com/api/anime/random?apikey=prince';
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                },
                timeout: 30000
            });
            
            if (!response.data || !response.data.result) {
                throw new Error('Invalid API response: missing anime data');
            }
            
            const animeData = response.data.result;
            
            let caption = `*${animeData.title || 'Unknown'}*\n\n`;
            
            if (animeData.episodes) {
                caption += `📺 Episodes: ${animeData.episodes}\n`;
            }
            
            if (animeData.status) {
                caption += `📊 Status: ${animeData.status}\n`;
            }
            
            if (animeData.synopsis) {
                caption += `\n📝 ${animeData.synopsis}\n`;
            }
            
            if (animeData.link) {
                caption += `\n🔗 ${animeData.link}`;
            }
            
            // Try to send with image
            if (animeData.thumbnail) {
                try {
                    const imageResponse = await axios.get(animeData.thumbnail, {
                        responseType: 'arraybuffer',
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            'Accept': 'image/*'
                        },
                        timeout: 30000
                    });
                    
                    const imageBuffer = Buffer.from(imageResponse.data);
                    
                    if (imageBuffer && imageBuffer.length > 0 && imageBuffer.length < 5 * 1024 * 1024) {
                        await conn.sendMessage(from, {
                            image: imageBuffer,
                            caption: caption
                        }, { quoted: message });
                        
                        if (module.exports.react) {
                            await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                        }
                        return;
                    }
                } catch (imgError) {
                    console.error('[random] thumbnail error:', imgError);
                }
            }
            
            // Fallback to text only
            await reply(caption);
            
            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[random] error:', error);
            
            if (error.response?.status === 404) {
                await reply('❌ Anime data not found. Please try again.');
            } else if (error.response?.status === 429) {
                await reply('❌ Rate limit exceeded. Please try again later.');
            } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                await reply('❌ Request timed out. Please try again.');
            } else {
                await reply(`❌ Failed to fetch anime data: ${error.message}`);
            }
        }
    }
};