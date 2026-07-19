/**
 * Lyrics Finder
 */

const axios = require('axios');

module.exports = {
    pattern: "lyrics",
    alias: ["lyric", "lirik"],
    desc: "Get lyrics of a song",
    category: "media",
    react: "🎵",
    filename: __filename,
    use: ".lyrics <song name>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            if (args.length === 0) {
                return await reply(`❌ Please provide a song name!\n\nExample: .lyrics Despacito`);
            }
            
            const query = args.join(' ');
            let lyricsData = null;
            
            try {
                const response = await axios.get(`https://api.vreden.my.id/api/lyrics?query=${encodeURIComponent(query)}`);
                if (response.data && response.data.result) {
                    lyricsData = {
                        title: response.data.result.title,
                        artist: response.data.result.artist,
                        lyrics: response.data.result.lyrics,
                        thumbnail: response.data.result.thumbnail
                    };
                }
            } catch (err) {
                console.log('Vreden API failed, trying next...');
            }
            
            if (!lyricsData) {
                try {
                    const response = await axios.get(`https://api.siputzx.my.id/api/s/lyrics?query=${encodeURIComponent(query)}`);
                    if (response.data && response.data.status && response.data.data) {
                        lyricsData = {
                            title: response.data.data.title,
                            artist: response.data.data.artist,
                            lyrics: response.data.data.lyrics,
                            thumbnail: response.data.data.image
                        };
                    }
                } catch (err) {
                    console.log('Siputzx API failed');
                }
            }
            
            if (!lyricsData) {
                return await reply('❌ Could not find lyrics for this song!');
            }
            
            let lyrics = lyricsData.lyrics;
            if (lyrics.length > 4000) {
                lyrics = lyrics.substring(0, 4000) + '...\n\n_Lyrics too long, showing first part only_';
            }
            
            const botName = process.env.BOT_NAME || 'QADEER-XD MINI';
            const caption = `🎵 *${lyricsData.title}*\n` +
                           `👤 *Artist:* ${lyricsData.artist}\n\n` +
                           `📝 *Lyrics:*\n${lyrics}\n\n` +
                           `_Fetched by ${botName}_`;
            
            if (lyricsData.thumbnail) {
                await conn.sendMessage(from, {
                    image: { url: lyricsData.thumbnail },
                    caption: caption
                }, { quoted: message });
            } else {
                await reply(caption);
            }
            
        } catch (error) {
            console.error('[lyrics] error:', error);
            await reply('❌ An error occurred while fetching lyrics!');
        }
    }
};