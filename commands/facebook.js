/**
 * Facebook Downloader - Download Facebook videos
 */

const { facebookdl } = require('@bochilteam/scraper-facebook');
const axios = require('axios');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

module.exports = {
    pattern: "facebook",
    alias: ["fb", "fbdl", "facebookdl"],
    desc: "Download Facebook videos",
    category: "media",
    react: "📥",
    filename: __filename,
    use: ".facebook <Facebook URL>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (processedMessages.has(message.key.id)) {
                return;
            }
            
            processedMessages.add(message.key.id);
            setTimeout(() => {
                processedMessages.delete(message.key.id);
            }, 5 * 60 * 1000);
            
            const args = m.args || [];
            const url = args.join(' ').trim();
            
            if (!url) {
                return await reply('Please provide a Facebook link for the video.');
            }
            
            const facebookPatterns = [
                /https?:\/\/(?:www\.|m\.)?facebook\.com\//,
                /https?:\/\/(?:www\.|m\.)?fb\.com\//,
                /https?:\/\/fb\.watch\//,
                /https?:\/\/(?:www\.)?facebook\.com\/watch/,
                /https?:\/\/(?:www\.)?facebook\.com\/.*\/videos\//
            ];
            
            const isValidUrl = facebookPatterns.some(pattern => pattern.test(url));
            
            if (!isValidUrl) {
                return await reply('That is not a valid Facebook link. Please provide a valid Facebook video link.');
            }
            
            await conn.sendMessage(from, {
                react: { text: '🔄', key: message.key }
            });
            
            try {
                const data = await facebookdl(url);
                
                if (!data || !data.video || !Array.isArray(data.video) || data.video.length === 0) {
                    throw new Error('No video data found');
                }
                
                const videoOption = data.video[0];
                if (!videoOption || !videoOption.download) {
                    throw new Error('No video download function found');
                }
                
                const videoData = await videoOption.download();
                
                let videoUrl = null;
                let videoBuffer = null;
                
                if (typeof videoData === 'string') {
                    videoUrl = videoData;
                } else if (Buffer.isBuffer(videoData)) {
                    videoBuffer = videoData;
                } else if (videoData && videoData.url) {
                    videoUrl = videoData.url;
                } else if (videoData && videoData.data) {
                    videoBuffer = Buffer.from(videoData.data);
                } else {
                    throw new Error('Invalid video data format');
                }
                
                const botName = process.env.BOT_NAME || 'QADEER-XD MINI';
                let caption = `*DOWNLOADED BY ${botName.toUpperCase()}*`;
                
                const parts = [];
                if (data.duration) {
                    parts.push(`⏱️ Duration: ${data.duration}`);
                }
                if (videoOption.quality) {
                    parts.push(`📹 Quality: ${videoOption.quality}`);
                }
                if (parts.length > 0) {
                    caption += '\n\n' + parts.join('\n');
                }
                
                if (videoBuffer) {
                    await conn.sendMessage(from, {
                        video: videoBuffer,
                        mimetype: 'video/mp4',
                        caption: caption
                    }, { quoted: message });
                } else if (videoUrl) {
                    try {
                        await conn.sendMessage(from, {
                            video: { url: videoUrl },
                            mimetype: 'video/mp4',
                            caption: caption
                        }, { quoted: message });
                    } catch (urlError) {
                        console.error('URL send failed, trying buffer method:', urlError.message);
                        try {
                            const videoResponse = await axios.get(videoUrl, {
                                responseType: 'arraybuffer',
                                timeout: 60000,
                                maxContentLength: 100 * 1024 * 1024,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Referer': 'https://www.facebook.com/'
                                }
                            });
                            
                            const buffer = Buffer.from(videoResponse.data);
                            await conn.sendMessage(from, {
                                video: buffer,
                                mimetype: 'video/mp4',
                                caption: caption
                            }, { quoted: message });
                        } catch (bufferError) {
                            console.error('Buffer method also failed:', bufferError.message);
                            throw new Error('Failed to send video');
                        }
                    }
                } else {
                    throw new Error('No video URL or buffer found');
                }
                
            } catch (error) {
                console.error('[facebook] error:', error);
                await reply(`❌ Failed to download Facebook video.\n\nError: ${error.message}\n\nPlease try again with a different link.`);
            }
        } catch (error) {
            console.error('[facebook] error:', error);
            await reply('An error occurred while processing the request. Please try again later.');
        }
    }
};