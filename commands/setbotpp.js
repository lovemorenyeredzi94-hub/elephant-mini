const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = {
    pattern: "setbotpp",
    alias: ["setppbot", "setpp"],
    desc: "Set bot profile picture from image or sticker",
    category: "owner",
    react: "🖼️",
    filename: __filename,
    use: ".setbotpp (reply to image or sticker)",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMessage) {
                return reply('⚠️ Please reply to an image or sticker with the .setbotpp command!');
            }

            const imageMessage = quotedMessage.imageMessage;
            const stickerMessage = quotedMessage.stickerMessage;
            
            if (!imageMessage && !stickerMessage) {
                return reply('❌ The replied message must contain an image or sticker!');
            }
            
            const mediaMessage = imageMessage || stickerMessage;

            const tmpDir = path.join(__dirname, '../../tmp');
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            
            const imagePath = path.join(tmpDir, `profile_${Date.now()}.jpg`);
            
            try {
                const stream = await downloadContentFromMessage(mediaMessage, 'image');
                let buffer = Buffer.from([]);
                
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                if (buffer.length > MAX_FILE_SIZE) {
                    return reply(`❌ File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
                }
                
                fs.writeFileSync(imagePath, buffer);
                await conn.updateProfilePicture(conn.user.id.split(':')[0] + '@s.whatsapp.net', { url: imagePath });

                await reply('✅ Successfully updated bot profile picture!');

                if (module.exports.react) {
                    await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                }
            } catch (error) {
                console.error('[setbotpp] error:', error);
                reply('❌ Failed to update profile picture!');
            } finally {
                try {
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                } catch (e) {}
            }
        } catch (error) {
            console.error('[setbotpp] error:', error);
            reply('❌ Failed to update profile picture!');
        }
    }
};