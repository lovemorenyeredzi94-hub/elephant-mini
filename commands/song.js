/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

module.exports = {
    pattern: "song",
    alias: ["play", "music", "yta"],
    desc: "Download audio from YouTube",
    category: "media",
    react: "🎵",
    filename: __filename,
    use: ".song <song name or YouTube link>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            const text = args.join(' ');
            
            if (!text) {
                return await reply('Usage: .song <song name or YouTube link>');
            }
            
            let video;
            
            if (text.includes('youtube.com') || text.includes('youtu.be')) {
                video = { url: text };
            } else {
                const search = await yts(text);
                if (!search || !search.videos.length) {
                    return await reply('No results found.');
                }
                video = search.videos[0];
            }
            
            await conn.sendMessage(from, {
                image: { url: video.thumbnail },
                caption: `🎵 Downloading: *${video.title}*\n⏱ Duration: ${video.timestamp}`
            }, { quoted: message });
            
            let audioData;
            let audioBuffer;
            let downloadSuccess = false;
            
            const apiMethods = [
                { name: 'EliteProTech', method: () => getEliteProTechAudioByUrl(video.url) },
                { name: 'Yupra', method: () => getYupraAudioByUrl(video.url) },
                { name: 'Okatsu', method: () => getOkatsuAudioByUrl(video.url) },
                { name: 'Izumi', method: () => getIzumiAudioByUrl(video.url) }
            ];
            
            for (const apiMethod of apiMethods) {
                try {
                    audioData = await apiMethod.method();
                    const audioUrl = audioData.download || audioData.dl || audioData.url;
                    
                    if (!audioUrl) {
                        console.log(`${apiMethod.name} returned no download URL, trying next API...`);
                        continue;
                    }
                    
                    try {
                        const audioResponse = await axios.get(audioUrl, {
                            responseType: 'arraybuffer',
                            timeout: 90000,
                            maxContentLength: Infinity,
                            maxBodyLength: Infinity,
                            decompress: true,
                            validateStatus: s => s >= 200 && s < 400,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': '*/*',
                                'Accept-Encoding': 'identity'
                            }
                        });
                        audioBuffer = Buffer.from(audioResponse.data);
                        
                        if (audioBuffer && audioBuffer.length > 0) {
                            downloadSuccess = true;
                            break;
                        }
                    } catch (downloadErr) {
                        const statusCode = downloadErr.response?.status || downloadErr.status;
                        if (statusCode === 451) {
                            console.log(`Download blocked (451) from ${apiMethod.name}, trying next API...`);
                            continue;
                        }
                        
                        try {
                            const audioResponse = await axios.get(audioUrl, {
                                responseType: 'stream',
                                timeout: 90000,
                                maxContentLength: Infinity,
                                maxBodyLength: Infinity,
                                validateStatus: s => s >= 200 && s < 400,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                    'Accept': '*/*',
                                    'Accept-Encoding': 'identity'
                                }
                            });
                            const chunks = [];
                            await new Promise((resolve, reject) => {
                                audioResponse.data.on('data', c => chunks.push(c));
                                audioResponse.data.on('end', resolve);
                                audioResponse.data.on('error', reject);
                            });
                            audioBuffer = Buffer.concat(chunks);
                            
                            if (audioBuffer && audioBuffer.length > 0) {
                                downloadSuccess = true;
                                break;
                            }
                        } catch (streamErr) {
                            const streamStatusCode = streamErr.response?.status || streamErr.status;
                            if (streamStatusCode === 451) {
                                console.log(`Stream download blocked (451) from ${apiMethod.name}, trying next API...`);
                            } else {
                                console.log(`Stream download failed from ${apiMethod.name}:`, streamErr.message);
                            }
                            continue;
                        }
                    }
                } catch (apiErr) {
                    console.log(`${apiMethod.name} API failed:`, apiErr.message);
                    continue;
                }
            }
            
            if (!downloadSuccess || !audioBuffer) {
                throw new Error('All download sources failed. The content may be unavailable or blocked in your region.');
            }

            const botName = process.env.BOT_NAME || 'QADEER-XD MINI';
            await conn.sendMessage(from, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.mp3`,
                ptt: false
            }, { quoted: message });
            
        } catch (err) {
            console.error('[song] error:', err);
            
            let errorMessage = '❌ Failed to download song.';
            if (err.message && err.message.includes('blocked')) {
                errorMessage = '❌ Download blocked. The content may be unavailable in your region or due to legal restrictions.';
            } else if (err.response?.status === 451 || err.status === 451) {
                errorMessage = '❌ Content unavailable (451). This may be due to legal restrictions or regional blocking.';
            } else if (err.message && err.message.includes('All download sources failed')) {
                errorMessage = '❌ All download sources failed. The content may be unavailable or blocked.';
            }
            
            await reply(errorMessage);
        }
    }
};

async function getEliteProTechAudioByUrl(url) {
    const response = await axios.get(`https://eliteprotech-apis.zone.id/yt`, {
        params: { url: url, type: 'mp3' },
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

async function getYupraAudioByUrl(url) {
    const response = await axios.get(`https://yupra.my.id/api/download/yt`, {
        params: { url: url, type: 'audio' },
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

async function getOkatsuAudioByUrl(url) {
    const response = await axios.get(`https://api.okatsu.my.id/api/download/yt`, {
        params: { url: url, quality: '128kbps' },
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

async function getIzumiAudioByUrl(url) {
    const response = await axios.get(`https://api.izumi.my.id/api/download/yt`, {
        params: { url: url, type: 'mp3' },
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    if (!response.data || !response.data.result) {
        throw new Error('Izumi API failed');
    }
    return response.data.result;
}