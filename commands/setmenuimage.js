/**
 * SetMenuImage Command - Owner only
 * Set/change the menu image by replying to an image or sticker
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
    pattern: "setmenuimage",
    alias: ["setmenuimg", "changemenuimage"],
    desc: "Set or change the menu image (owner only)",
    category: "owner",
    react: "🖼️",
    filename: __filename,
    use: ".setmenuimage (reply to image/sticker)",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const ctx = message.message?.extendedTextMessage?.contextInfo;
            if (!ctx?.quotedMessage) {
                return reply('📷 Please reply to an *image* or *sticker* to set it as the menu image.');
            }
            
            const quotedMsg = ctx.quotedMessage;
            const imageMsg = quotedMsg.imageMessage || quotedMsg.stickerMessage;
            
            if (!imageMsg) {
                return reply('❌ The replied message must be an *image* or *sticker*.');
            }
            
            const targetMessage = {
                key: {
                    remoteJid: from,
                    id: ctx.stanzaId,
                    participant: ctx.participant,
                },
                message: quotedMsg,
            };
            
            const mediaBuffer = await downloadMediaMessage(
                targetMessage,
                'buffer',
                {},
                { logger: undefined, reuploadRequest: conn.updateMediaMessage },
            );
            
            if (!mediaBuffer) {
                return reply('❌ Failed to download the image. Please try again.');
            }
            
            // Convert to JPEG if it's a sticker
            let finalBuffer = mediaBuffer;
            if (quotedMsg.stickerMessage) {
                try {
                    const sharp = require('sharp');
                    finalBuffer = await sharp(mediaBuffer).jpeg({ quality: 90 }).toBuffer();
                } catch (e) {
                    // If sharp not available, use as-is
                }
            }
            
            // Save to utils/bot_image.jpg
            const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
            const utilsDir = path.dirname(imagePath);
            
            if (!fs.existsSync(utilsDir)) {
                fs.mkdirSync(utilsDir, { recursive: true });
            }
            
            // Delete old image if exists
            if (fs.existsSync(imagePath)) {
                try {
                    fs.unlinkSync(imagePath);
                } catch (e) {}
            }
            
            // Write new image
            fs.writeFileSync(imagePath, finalBuffer);
            
            await reply('✅ Menu image has been updated successfully!');

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[setmenuimage] error:', error);
            await reply(`❌ Failed to set menu image: ${error.message}`);
        }
    }
};