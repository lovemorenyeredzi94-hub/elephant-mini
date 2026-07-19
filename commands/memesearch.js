/**
 * Meme Search Command - Search and get memes
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'https://api.shizo.top/tools/meme-search';

module.exports = {
    pattern: "memesearch",
    alias: ["memes", "sm", "smeme", "gifsearch", "gif"],
    desc: "Search and get memes",
    category: "fun",
    react: "🔍",
    filename: __filename,
    use: ".memesearch <query>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            const query = args.join(' ').trim();
            
            if (!query) {
                return await reply(
                    'Usage: .memesearch <query>\n\nExample: .memesearch hello'
                );
            }
            
            const url = `${BASE}?apikey=shizo&query=${encodeURIComponent(query)}`;
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            const mediaBuffer = Buffer.from(response.data);
            
            if (!mediaBuffer || mediaBuffer.length === 0) {
                throw new Error('Empty response from API');
            }
            
            const fileHeader = mediaBuffer.slice(0, 6).toString('ascii');
            const isGIF = fileHeader === 'GIF89a' || fileHeader === 'GIF87a';
            
            if (isGIF) {
                await conn.sendMessage(from, {
                    video: mediaBuffer,
                    mimetype: 'video/mp4',
                    gifPlayback: true
                }, { quoted: message });
            } else {
                await conn.sendMessage(from, {
                    image: mediaBuffer
                }, { quoted: message });
            }

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[memesearch] error:', error);
            await reply(`❌ Failed to fetch meme: ${error.message}`);
        }
    }
};