module.exports = {
    pattern: "gayrate",
    alias: ["gay"],
    desc: "Playful gay percentage. Reply or mention a user.",
    category: "fun",
    react: "🌈",
    filename: __filename,
    use: ".gayrate (reply or @user)",
    
    execute: async (conn, message, m, { from, isGroup, reply, sender }) => {
        try {
            const ctx = message.message?.extendedTextMessage?.contextInfo || {};
            const mentioned = ctx.mentionedJid || [];
            let targetId = null;
            
            if (mentioned.length) targetId = mentioned[0];
            else if (ctx.participant) targetId = ctx.participant;
            else targetId = sender;

            const targetTag = `@${(targetId || sender).split('@')[0]}`;

            const base = (targetId || sender).toString().split('').reduce((s, c) => s + c.charCodeAt(0), 0);
            const percent = ((base % 101) + Math.floor(Math.random() * 7)) % 101;

            const messages = [
                `${targetTag} is ${percent}% fabulous 🌈`,
                `💖 Compatibility with rainbows: ${percent}% for ${targetTag}`,
                `${targetTag} score: ${percent}% pure glitter ✨`
            ];

            const out = messages[Math.floor(Math.random() * messages.length)];
            await conn.sendMessage(from, { text: out, mentions: [targetId] }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[gayrate] error:', error);
            await reply('❌ Something went wrong.');
        }
    }
};