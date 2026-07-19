/**
 * Joke Command - Send random jokes
 */

const axios = require('axios');

module.exports = {
    pattern: "joke",
    alias: ["jokes"],
    desc: "Get random joke",
    category: "fun",
    react: "😂",
    filename: __filename,
    use: ".joke",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
            const joke = response.data;
            
            await reply(`${joke.setup}\n\n${joke.punchline}`);

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[joke] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};