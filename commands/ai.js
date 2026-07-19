/**
 * AI Chat Command - ChatGPT-style responses
 */

const axios = require('axios');

module.exports = {
    pattern: "ai",
    alias: ["gpt", "chatgpt", "ask"],
    desc: "Chat with AI (ChatGPT-style)",
    category: "ai",
    react: "🤖",
    filename: __filename,
    use: ".ai <question>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            if (args.length === 0) {
                return reply('❌ Usage: .ai <question>\n\nExample: .ai What is the capital of France?');
            }
            
            const question = args.join(' ');
            
            const response = await axios.get(`https://api.princetechn.com/api/ai/mistral?apikey=prince&q=${encodeURIComponent(question)}`);
            const answer = response.data?.result || response.data?.msg || response.data?.response || 'No response';
            
            await reply(answer);
            
            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[ai] error:', error);
            await reply(`❌ AI Error: ${error.message}`);
        }
    }
};