/**
 * Video Downloader - Download video from YouTube
 */

const yts = require('yt-search');
const axios = require('axios');

module.exports = {
    pattern: "ytvideo",
    alias: ["ytv", "ytmp4", "ytvid", "video"],
    desc: "Download video from YouTube",
    category: "media",
    react: "📹",
    filename: __filename,
    use: ".ytvideo <video name or URL>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            const searchQuery = args.join(' ').trim();

            if (!searchQuery) {
                return await reply('What video do you want to download?');
            }

            let videoUrl = '';
            let videoTitle = '';
            let videoThumbnail = '';

            if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
                videoUrl = searchQuery;
            } else {
                const { videos } = await yts(searchQuery);
                if (!videos || videos.length === 0) {
                    return await reply('No videos found!');
                }
                videoUrl = videos[0].url;
                videoTitle = videos[0].title;
                videoThumbnail = videos[0].thumbnail;
            }

            try {
                const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
                const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
                const captionTitle = videoTitle || searchQuery;
                if (thumb) {
                    await conn.sendMessage(from, {
                        image: { url: thumb },
                        caption: `*${captionTitle}*\nDownloading...`
                    }, { quoted: message });
                }
            } catch (e) {
                console.error('[ytvideo] thumb error:', e?.message || e);
            }

            let urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
            if (!urls) {
                return await reply('This is not a valid YouTube link!');
            }

            let videoData;
            try {
                videoData = await getEliteProTechVideoByUrl(videoUrl);
            } catch (e1) {
                try {
                    videoData = await getYupraVideoByUrl(videoUrl);
                } catch (e2) {
                    videoData = await getOkatsuVideoByUrl(videoUrl);
                }
            }

            const botName = process.env.BOT_NAME || 'ELEPHANT-MD';
            await conn.sendMessage(from, {
                video: { url: videoData.download },
                mimetype: 'video/mp4',
                fileName: `${(videoData.title || videoTitle || 'video').replace(/[^\w\s-]/g, '')}.mp4`,
                caption: `*${videoData.title || videoTitle || 'Video'}*\n\n> *_Downloaded by ${botName}_*`
            }, { quoted: message });

        } catch (error) {
            console.error('[ytvideo] error:', error?.message || error);
            await reply('Download failed: ' + (error?.message || 'Unknown error'));
        }
    }
};

async function getEliteProTechVideoByUrl(url) {
    const response = await axios.get(`https://eliteprotech-apis.zone.id/yt`, {
        params: { url: url, type: 'mp4' },
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    if (!response.data || response.data.status !== 'success') {
        throw new Error('EliteProTech API failed');
    }
    return response.data.result;
}

async function getYupraVideoByUrl(url) {
    const response = await axios.get(`https://yupra.my.id/api/download/yt`, {
        params: { url: url, type: 'video' },
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    if (!response.data || !response.data.result) {
        throw new Error('Yupra API failed');
    }
    return response.data.result;
}

async function getOkatsuVideoByUrl(url) {
    const response = await axios.get(`https://api.okatsu.my.id/api/download/yt`, {
        params: { url: url, quality: '360p' },
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    if (!response.data || !response.data.result) {
        throw new Error('Okatsu API failed');
    }
    return response.data.result;
}