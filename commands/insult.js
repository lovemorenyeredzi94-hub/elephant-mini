module.exports = {
    pattern: "insult",
    alias: ["insultme", "burn"],
    desc: "Give a silly insult to a user. Reply or mention to target someone.",
    category: "fun",
    react: "😤",
    filename: __filename,
    use: ".insult (reply or @user)",
    
    execute: async (conn, message, m, { from, isGroup, reply, sender }) => {
        try {
            const ctx = message.message?.extendedTextMessage?.contextInfo || {};
            const mentioned = ctx.mentionedJid || [];
            let targetId = null;
            
            if (mentioned.length) targetId = mentioned[0];
            else if (ctx.participant) targetId = ctx.participant;
            else targetId = sender;

            const insults = [
                "You're as useful as a white crayon.",
                "I'd call you sharp, but that would be offensive to pencils.",
                "You're like a cloud. When you disappear, it's a beautiful day.",
                "You bring everyone so much joy... when you leave the room.",
                "If laziness was an Olympic sport, you'd come in fourth — so you wouldn't have to walk up to the podium."
            ];

            const line = insults[Math.floor(Math.random() * insults.length)];
            await conn.sendMessage(from, { text: `${line}`, mentions: [targetId] }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[insult] error:', error);
            await reply('❌ Something went wrong.');
        }
    }
};