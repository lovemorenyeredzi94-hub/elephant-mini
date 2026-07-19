/**
 * Bomb Game - Interactive number guessing game
 */

// Store game state per user
const gameState = new Map();

module.exports = {
    pattern: "bomb",
    alias: ["bom"],
    desc: "Play bomb game - pick numbers 1-9, avoid the bomb!",
    category: "fun",
    react: "💣",
    filename: __filename,
    use: ".bomb",
    
    execute: async (conn, message, m, { from, isGroup, reply, sender }) => {
        try {
            const timeout = 180000; // 3 minutes
            
            // Check if user already has an active game
            if (gameState.has(sender)) {
                const game = gameState.get(sender);
                
                const text = message.message?.conversation || 
                             message.message?.extendedTextMessage?.text || '';
                
                if (text.toLowerCase().trim() === 'suren' || text.toLowerCase().trim() === 'surrender') {
                    const bombBox = game.array.find(v => v.emot === '💥');
                    await reply(`*You surrendered!* 💣\n\nThe bomb was in box number ${bombBox.number}.`);
                    clearTimeout(game.timeoutId);
                    gameState.delete(sender);
                    return;
                }
                
                const number = parseInt(text.trim());
                if (isNaN(number) || number < 1 || number > 9) {
                    return;
                }
                
                const selectedBox = game.array.find(v => v.position === number);
                if (!selectedBox || selectedBox.state) {
                    return;
                }
                
                selectedBox.state = true;
                
                if (selectedBox.emot === '💥') {
                    let teks = `💥 *B O M B  E X P L O D E D!*\n\n`;
                    teks += `You selected box number ${selectedBox.number} and...\n\n`;
                    teks += `💣 *BOOM!* 💣\n\n`;
                    teks += `Game Over!\n\n`;
                    teks += `*Final Result:*\n`;
                    for (let i = 0; i < game.array.length; i += 3) {
                        teks += game.array.slice(i, i + 3).map(v => v.emot).join('') + '\n';
                    }
                    
                    await conn.sendMessage(from, { text: teks }, { quoted: game.msg });
                    clearTimeout(game.timeoutId);
                    gameState.delete(sender);
                    return;
                }
                
                const safeBoxes = game.array.filter(v => v.emot === '✅');
                const openedSafeBoxes = safeBoxes.filter(v => v.state);
                
                if (openedSafeBoxes.length === safeBoxes.length) {
                    let teks = `🎉 *YOU WIN!*\n\n`;
                    teks += `Congratulations! You successfully opened all safe boxes!\n\n`;
                    teks += `*Final Result:*\n`;
                    for (let i = 0; i < game.array.length; i += 3) {
                        teks += game.array.slice(i, i + 3).map(v => v.emot).join('') + '\n';
                    }
                    
                    await conn.sendMessage(from, { text: teks }, { quoted: game.msg });
                    clearTimeout(game.timeoutId);
                    gameState.delete(sender);
                    return;
                }
                
                let teks = `乂  *B O M B*\n\n`;
                teks += `Box number ${selectedBox.number} opened: ${selectedBox.emot}\n\n`;
                teks += `Send number *1* - *9* to open a box:\n\n`;
                for (let i = 0; i < game.array.length; i += 3) {
                    teks += game.array.slice(i, i + 3).map(v => v.state ? v.emot : v.number).join('') + '\n';
                }
                teks += `\nTimeout : [ *${((timeout / 1000) / 60)} minutes* ]\n`;
                teks += `Type *suren* to surrender.`;
                
                await conn.sendMessage(from, { text: teks }, { quoted: game.msg });
                return;
            }
            
            // Start new game
            const bom = ['💥', '✅', '✅', '✅', '✅', '✅', '✅', '✅', '✅'].sort(() => Math.random() - 0.5);
            const number = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
            const array = bom.map((v, i) => ({
                emot: v,
                number: number[i],
                position: i + 1,
                state: false
            }));
            
            let teks = `乂  *B O M B*\n\n`;
            teks += `Send number *1* - *9* to open the *9* boxes below:\n\n`;
            for (let i = 0; i < array.length; i += 3) {
                teks += array.slice(i, i + 3).map(v => v.state ? v.emot : v.number).join('') + '\n';
            }
            teks += `\nTimeout : [ *${((timeout / 1000) / 60)} minutes* ]\n`;
            teks += `If you get the box with the bomb, points will be deducted. Type *suren* to surrender.`;
            
            const gameMsg = await conn.sendMessage(from, {
                text: teks,
                contextInfo: {
                    externalAdReply: {
                        title: "Bomb Game",
                        body: 'Avoid the bomb!',
                        thumbnailUrl: "https://telegra.ph/file/b3138928493e78b55526f.jpg",
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: message });
            
            const timeoutId = setTimeout(() => {
                if (gameState.has(sender)) {
                    const game = gameState.get(sender);
                    const bombBox = game.array.find(v => v.emot === '💥');
                    conn.sendMessage(from, {
                        text: `*Time's up!* ⏰\n\nThe bomb was in box number ${bombBox.number}.`
                    }, { quoted: game.msg });
                    gameState.delete(sender);
                }
            }, timeout);
            
            gameState.set(sender, {
                msg: gameMsg,
                array: array,
                timeoutId: timeoutId
            });
            
            setTimeout(() => {
                if (gameState.has(sender)) {
                    gameState.delete(sender);
                }
            }, timeout + 60000);

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[bomb] error:', error);
            await reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
        }
    },
    
    // Export gameState for handler access
    gameState
};