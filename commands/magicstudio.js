/**
 * Imagine Command - AI image generation via PrinceTech Flux API
 */

const axios = require('axios');

const API_BASE = 'https://api.princetechn.com/api/ai/fluximg';
const API_KEY = 'prince';

module.exports = {
    pattern: "imagine",
    alias: ["magic", "magicai", "aiimage", "generate"],
    desc: "Generate AI art from text prompt",
    category: "ai",
    react: "🎨",
    filename: __filename,
    use: ".imagine <prompt>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            const prompt = args.join(' ').trim();

            if (!prompt) {
                return await reply(
                    'Usage: .imagine <prompt>\n\nExample: .imagine a handsome gentleman'
                );
            }

            const apiUrl = `${API_BASE}?apikey=${API_KEY}&prompt=${encodeURIComponent(prompt)}`;
            const { data } = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    Accept: 'application/json',
                },
                timeout: 120000,
            });

            if (!data?.success || data?.status !== 200 || !data?.result) {
                throw new Error(data?.message || 'API did not return an image');
            }

            const imageResponse = await axios.get(data.result, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    Accept: 'image/*',
                },
                timeout: 120000,
            });

            const imageBuffer = Buffer.from(imageResponse.data);

            if (!imageBuffer || imageBuffer.length === 0) {
                throw new Error('Empty response from image URL');
            }

            await conn.sendMessage(from, {
                image: imageBuffer,
                caption: `🎨 *Imagine*\n\n📝 ${prompt}`,
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[imagine] error:', error);
            await reply(`❌ Failed to generate image: ${error.message}`);
        }
    }
};