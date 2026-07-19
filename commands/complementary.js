/**
 * Compliment - Send a random compliment
 */

module.exports = {
    pattern: "compliment",
    alias: ["praise", "compliment"],
    desc: "Get a random compliment",
    category: "fun",
    react: "💙",
    filename: __filename,
    use: ".compliment [@user]",
    
    execute: async (conn, message, m, { from, isGroup, reply, sender }) => {
        try {
            const compliments = [
                "You're an awesome friend! 💙",
                "You light up the room! ✨",
                "You're someone's reason to smile! 😊",
                "You're even better than a unicorn! 🦄",
                "You're a gift to those around you! 🎁",
                "You're a smart cookie! 🍪",
                "You're awesome! 🌟",
                "You have the best laugh! 😄",
                "You're gorgeous! 💖",
                "You're more helpful than you realize! 🤝",
                "You have a great sense of humor! 😂",
                "You're really something special! ⭐",
                "You're an incredible friend! 🫂",
                "Your perspective is refreshing! 🌈",
                "You're making a difference! 🌍",
                "You're stronger than you think! 💪",
                "Your smile is contagious! 😁",
                "You're one of a kind! 💎",
                "You bring out the best in people! 👏",
                "You're inspiring! 🌟"
            ];
            
            const randomCompliment = compliments[Math.floor(Math.random() * compliments.length)];
            const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            
            let text = randomCompliment;
            let mentions = [];
            
            if (mentioned.length > 0) {
                mentions = mentioned;
            } else {
                mentions = [sender];
            }
            
            await conn.sendMessage(from, {
                text: text,
                mentions: mentions
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[compliment] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};