/**
 * Pies Command - Get random pies images by country
 */

const axios = require('axios');

const BASE = 'https://api.shizo.top/pies';
const VALID_COUNTRIES = ['india', 'malaysia', 'thailand', 'china', 'indonesia', 'japan', 'korea', 'vietnam'];

module.exports = {
    pattern: "pies",
    alias: ["pie", "india", "malaysia", "thailand", "china", "indonesia", "japan", "korea", "vietnam"],
    desc: "Get random pies images by country",
    category: "fun",
    react: "🥧",
    filename: __filename,
    use: ".pies <country>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            let country = (args[0] || '').toLowerCase();
            
            // Check if command itself is a country
            const commandUsed = m.command || '';
            if (VALID_COUNTRIES.includes(commandUsed)) {
                country = commandUsed;
            }
            
            if (!country) {
                return await reply(
                    `Usage: .pies <country>\n\nCountries: ${VALID_COUNTRIES.join(', ')}`
                );
            }
            
            if (!VALID_COUNTRIES.includes(country)) {
                return await reply(
                    `❌ Unsupported country: ${country}\n\nTry one of: ${VALID_COUNTRIES.join(', ')}`
                );
            }
            
            const url = `${BASE}/${country}?apikey=shizo`;
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            const imageBuffer = Buffer.from(response.data);
            
            await conn.sendMessage(from, {
                image: imageBuffer,
                caption: `🥧 ${country.charAt(0).toUpperCase() + country.slice(1)}`
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[pies] error:', error);
            await reply(`❌ Failed to fetch image: ${error.message}`);
        }
    }
};