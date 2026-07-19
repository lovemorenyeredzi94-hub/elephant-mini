/**
 * Calculator Command - Perform math calculations
 */

module.exports = {
    pattern: "calc",
    alias: ["calculate", "math"],
    desc: "Calculate math expressions",
    category: "utility",
    react: "🧮",
    filename: __filename,
    use: ".calc <expression>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            if (args.length === 0) {
                return reply('❌ Usage: .calc <expression>\n\nExample: .calc 5 + 3 * 2');
            }
            
            const expression = args.join(' ');
            
            // Basic safety check
            if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
                return reply('❌ Invalid expression! Only numbers and operators (+, -, *, /, parentheses) allowed.');
            }
            
            try {
                // Use Function constructor for safer eval
                const result = Function(`"use strict"; return (${expression})`)();
                
                let text = `🧮 *Calculator*\n\n`;
                text += `📝 Expression: ${expression}\n`;
                text += `✅ Result: ${result}`;
                
                await reply(text);
                
                if (module.exports.react) {
                    await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                }
            } catch (evalError) {
                await reply('❌ Invalid mathematical expression!');
            }
            
        } catch (error) {
            console.error('[calc] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};