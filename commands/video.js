/**
 * Video Downloader - Download video from YouTube
 */

const yts = require('yt-search');
const APIs = require('./lib/api');

module.exports = {
  pattern: "ytvideo",
  alias: ["ytv", "ytmp4", "ytvid", "video"],
  desc: "Download video from YouTube",
  category: "media",
  react: "🎬",
  filename: __filename,
  use: ".video <video name or URL>",

  execute: async (conn, message, m, { from, q, reply }) => {
    try {
      const text = q || "";
      const chatId = from;

      if (!text) {
        return await conn.sendMessage(chatId, {
          text: 'What video do you want to download?'
        }, { quoted: message });
      }

      // Determine if input is a YouTube link
      let videoUrl = '';
      let videoTitle = '';
      let videoThumbnail = '';

      if (text.startsWith('http://') || text.startsWith('https://')) {
        videoUrl = text;
      } else {
        // Search YouTube for the video
        const { videos } = await yts(text);
        if (!videos || videos.length === 0) {
          return await conn.sendMessage(chatId, {
            text: 'No videos found!'
          }, { quoted: message });
        }
        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
        videoThumbnail = videos[0].thumbnail;
      }

      // Send thumbnail immediately
      try {
        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
        const captionTitle = videoTitle || text;
        if (thumb) {
          await conn.sendMessage(chatId, {
            image: { url: thumb },
            caption: `*${captionTitle}*\nDownloading...`
          }, { quoted: message });
        }
      } catch (e) {
        console.error('[VIDEO] thumb error:', e?.message || e);
      }

      // Validate YouTube URL
      let urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
      if (!urls) {
        return await conn.sendMessage(chatId, {
          text: 'This is not a valid YouTube link!'
        }, { quoted: message });
      }

      // Get video: try EliteProTech first, then Yupra, then Okatsu fallback
      let videoData;
      try {
        videoData = await APIs.getEliteProTechVideoByUrl(videoUrl);
      } catch (e1) {
        try {
          videoData = await APIs.getYupraVideoByUrl(videoUrl);
        } catch (e2) {
          videoData = await APIs.getOkatsuVideoByUrl(videoUrl);
        }
      }

      // Send video directly using the download URL
      await conn.sendMessage(chatId, {
        video: { url: videoData.download },
        mimetype: 'video/mp4',
        fileName: `${(videoData.title || videoTitle || 'video').replace(/[^\w\s-]/g, '')}.mp4`,
        caption: `*${videoData.title || videoTitle || 'Video'}*\n\n> *_Downloaded by ELEPHANT-MD_*`
      }, { quoted: message });

      // React if configured
      if (module.exports.react) {
        try {
          await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
        } catch (e) {}
      }

    } catch (error) {
      console.error('[VIDEO] Command Error:', error?.message || error);
      await conn.sendMessage(from, {
        text: 'Download failed: ' + (error?.message || 'Unknown error')
      }, { quoted: message });
    }
  }
};
