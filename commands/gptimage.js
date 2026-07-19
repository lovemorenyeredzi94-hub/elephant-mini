/**
 * GPT Image Command - Edit image using AI Image Editor
 */

const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const EDITIMG_API = 'https://restapis.xrizaldev.my.id/api/ai2/editimg';
const UGUU_UPLOAD = 'https://uguu.se/upload';

async function uploadToUguu(buffer, filename = 'image.jpg') {
    const form = new FormData();
    form.append('files[]', buffer, { filename, contentType: 'image/jpeg' });
    const { data } = await axios.post(UGUU_UPLOAD, form, {
        headers: form.getHeaders(),
        timeout: 30000,
        maxBodyLength: 20 * 1024 * 1024,
    });
    const url = data?.files?.[0]?.url || data?.data?.files?.[0]?.url || data?.[0]?.url;
    if (!url) throw new Error('No URL in uguu response');
    return url;
}

module.exports = {
    pattern: "gptimage",
    alias: ["gptimg", "editimage", "aiimage", "vision", "gi"],
    desc: "Edit image using AI Image Editor with a prompt",
    category: "ai",
    react: "✨",
    filename: __filename,
    use: ".gptimage <prompt> (reply to image/sticker)",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            const ctxInfo = message.message?.extendedTextMessage?.contextInfo;
            
            if (!ctxInfo?.quotedMessage) {
                return await reply(
                    '📷 *GPT Image Editor*\n\n' +
                    'Reply to an *image* or *sticker* with a prompt to edit it.\n\n' +
                    `Usage: .gptimage <your prompt>\n\n` +
                    'Example: Reply to an image with:\n' +
                    '.gptimage change the background to a beach'
                );
            }
            
            const prompt = args.join(' ').trim();
            if (!prompt) {
                return await reply(
                    '❌ Please provide a prompt!\n\n' +
                    `Usage: .gptimage <your prompt>\n\n` +
                    'Example: change the background to a beach'
                );
            }
            
            const targetMessage = {
                key: {
                    remoteJid: from,
                    id: ctxInfo.stanzaId,
                    participant: ctxInfo.participant,
                },
                message: ctxInfo.quotedMessage,
            };
            
            const quotedMsg = ctxInfo.quotedMessage;
            const isImage = !!quotedMsg.imageMessage;
            const isSticker = !!quotedMsg.stickerMessage;
            
            if (!isImage && !isSticker) {
                return await reply('❌ Please reply to an *image* or *sticker*!');
            }
            
            const mediaBuffer = await downloadMediaMessage(
                targetMessage,
                'buffer',
                {},
                { logger: undefined, reuploadRequest: conn.updateMediaMessage },
            );
            
            if (!mediaBuffer) {
                return await reply('❌ Failed to download image. Please try again.');
            }
            
            let imageBuffer = mediaBuffer;
            
            // Upload image
            let imageUrl;
            try {
                imageUrl = await uploadToUguu(imageBuffer, 'image.jpg');
            } catch (uploadErr) {
                console.error('Uguu upload error:', uploadErr);
                return await reply('❌ Failed to upload image. Please try again.');
            }

            const apiUrl = `${EDITIMG_API}?image_url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`;

            const response = await axios.get(apiUrl, {
                timeout: 120000,
                maxContentLength: 10 * 1024 * 1024,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });

            const result = response.data?.result || response.data;
            const outputImageUrl = result?.output_image;

            if (!outputImageUrl) {
                return await reply('❌ No image URL in API response. Please try again.');
            }

            const imageResponse = await axios.get(outputImageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
            });

            const resultImageBuffer = Buffer.from(imageResponse.data);

            if (!resultImageBuffer || resultImageBuffer.length === 0) {
                return await reply('❌ Empty image received from API. Please try again.');
            }

            await conn.sendMessage(from, {
                image: resultImageBuffer,
                caption: `✨ *AI Image Editor*\n\n📝 Prompt: ${prompt}`,
            }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[gptimage] error:', error);
            await reply(`❌ Error: ${error.message || 'Unknown error occurred'}`);
        }
    }
};