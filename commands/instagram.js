/**
 * Instagram Downloader - Using ruhend-scraper
 */

const { igdl } = require('ruhend-scraper');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

function extractUniqueMedia(mediaData) {
    const uniqueMedia = [];
    const seenUrls = new Set();
    
    for (const media of mediaData) {
        if (!media.url) continue;
        if (!seenUrls.has(media.url)) {
            seenUrls.add(media.url);
            uniqueMedia.push(media);
        }
    }
    return uniqueMedia;
}

module.exports = {
    pattern: "instagram",
    alias: ["ig", "insta", "igdl", "reels"],
    desc: "Download Instagram photos/videos/reels",
    category: "media",
    react: "📥",
    filename: __filename,
    use: ".instagram <URL>",
    
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
            const text = args.join(' ');
            
            if (!text) {
                return reply('Please provide an Instagram link for the video.');
            }
            
            const instagramPatterns = [
                /https?:\/\/(?:www\.)?instagram\.com\//,
                /https?:\/\/(?:www\.)?instagr\.am\//,
                /https?:\/\/(?:www\.)?instagram\.com\/p\//,
                /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
                /https?:\/\/(?:www\.)?instagram\.com\/tv\//
            ];
            
            const isValidUrl = instagramPatterns.some(pattern => pattern.test(text));
            
            if (!isValidUrl) {
                return reply('That is not a valid Instagram link. Please provide a valid Instagram post, reel, or video link.');
            }
            
            await conn.sendMessage(from, {
                react: { text: '📥', key: message.key }
            });
            
            const downloadData = await igdl(text);
            
            if (!downloadData || !downloadData.data || downloadData.data.length === 0) {
                return reply('❌ No media found at the provided link. The post might be private or the link is invalid.');
            }
            
            const mediaData = downloadData.data;
            const uniqueMedia = extractUniqueMedia(mediaData);
            const mediaToDownload = uniqueMedia.slice(0, 20);
            
            if (mediaToDownload.length === 0) {
                return reply('❌ No valid media found to download. This might be a private post or the scraper failed.');
            }
            
            const botName = process.env.BOT_NAME || 'QADEER-XD MINI';
            
            for (let i = 0; i < mediaToDownload.length; i++) {
                try {
                    const media = mediaToDownload[i];
                    const mediaUrl = media.url;
                    
                    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || 
                                  media.type === 'video' || 
                                  text.includes('/reel/') || 
                                  text.includes('/tv/');
                    
                    if (isVideo) {
                        await conn.sendMessage(from, {
                            video: { url: mediaUrl },
                            mimetype: 'video/mp4',
                            caption: `*DOWNLOADED BY ${botName.toUpperCase()}*`
                        }, { quoted: message });
                    } else {
                        await conn.sendMessage(from, {
                            image: { url: mediaUrl },
                            caption: `*DOWNLOADED BY ${botName.toUpperCase()}*`
                        }, { quoted: message });
                    }
                    
                    if (i < mediaToDownload.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                } catch (mediaError) {
                    console.error(`Error downloading media ${i + 1}:`, mediaError);
                }
            }
        } catch (error) {
            console.error('[instagram] error:', error);
            await reply('❌ An error occurred while processing the Instagram request. Please try again.');
        }
    }
};