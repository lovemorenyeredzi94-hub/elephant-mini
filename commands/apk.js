/**
 * APK Downloader - Download Android APK files from various sources
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

module.exports = {
    pattern: "apk",
    alias: ["apkdl", "downloadapk", "apkdownload"],
    desc: "Download Android APK files",
    category: "media",
    react: "📱",
    filename: __filename,
    use: ".apk <app name>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            // Check if message has already been processed
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
                return await reply(
                    `📱 *APK Downloader*\n\n` +
                    `Usage: .apk <app name>\n` +
                    `Example: .apk WhatsApp\n` +
                    `Example: .apk Instagram\n\n` +
                    `🔍 Searches for APK files from trusted sources.`
                );
            }
            
            const appName = text.trim();
            
            if (!appName) {
                return await reply(
                    `❌ Please provide an app name.\n\n` +
                    `Example: .apk WhatsApp\n` +
                    `Example: .apk Instagram`
                );
            }
            
            await conn.sendMessage(from, {
                react: { text: '🔍', key: message.key }
            });
            
            // Search for APK
            let apkData = null;
            
            try {
                apkData = await searchApkPure(appName);
            } catch (error) {
                console.error('ApkPure search error:', error.message);
                try {
                    apkData = await searchApkMirror(appName);
                } catch (fallbackError) {
                    console.error('ApkMirror search error:', fallbackError.message);
                    apkData = await searchApkCombo(appName);
                }
            }
            
            if (!apkData || !apkData.downloadUrl) {
                await conn.sendMessage(from, {
                    react: { text: '❌', key: message.key }
                });
                
                return await reply(
                    `❌ *APK Not Found*\n\n` +
                    `Could not find APK for "${appName}".\n\n` +
                    `💡 Tips:\n` +
                    `• Check the spelling\n` +
                    `• Try a shorter name\n` +
                    `• Try: .apk ${appName.split(' ')[0]}\n\n` +
                    `🔍 Try searching on:\n` +
                    `• https://apkpure.com\n` +
                    `• https://apkmirror.com`
                );
            }
            
            await conn.sendMessage(from, {
                react: { text: '📥', key: message.key }
            });
            
            const botName = process.env.BOT_NAME || 'QADEER-XD MINI';
            let caption = `*📱 APK DOWNLOADED BY ${botName.toUpperCase()}*\n\n`;
            
            caption += `📌 *App:* ${apkData.name || appName}\n`;
            if (apkData.version) {
                caption += `📦 *Version:* ${apkData.version}\n`;
            }
            if (apkData.size) {
                caption += `📏 *Size:* ${apkData.size}\n`;
            }
            if (apkData.package) {
                caption += `📋 *Package:* ${apkData.package}\n`;
            }
            if (apkData.source) {
                caption += `📡 *Source:* ${apkData.source}\n`;
            }
            
            caption += `\n╰─━─━─━─━─━─━─━─━─━─━╯\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}*`;
            
            try {
                const apkBuffer = await downloadApk(apkData.downloadUrl);
                
                if (!apkBuffer || apkBuffer.length < 1000) {
                    throw new Error('Downloaded file is too small or empty');
                }
                
                const fileName = `${apkData.name || appName}_${apkData.version || 'latest'}.apk`;
                
                await conn.sendMessage(from, {
                    document: apkBuffer,
                    fileName: fileName,
                    mimetype: 'application/vnd.android.package-archive',
                    caption: caption
                }, { quoted: message });
                
                await conn.sendMessage(from, {
                    react: { text: '✅', key: message.key }
                });
                
            } catch (downloadError) {
                console.error('APK download error:', downloadError.message);
                
                await conn.sendMessage(from, {
                    react: { text: '🔗', key: message.key }
                });
                
                await reply(
                    `⚠️ *Could not send APK file directly*\n\n` +
                    `📥 *Download Link:*\n${apkData.downloadUrl}\n\n` +
                    `📌 *App:* ${apkData.name || appName}\n` +
                    `📦 *Version:* ${apkData.version || 'Unknown'}\n\n` +
                    `💡 Click the link above to download the APK file.\n` +
                    `⚠️ Make sure you have "Install from Unknown Sources" enabled.`
                );
            }
            
        } catch (error) {
            console.error('[apk] error:', error);
            await conn.sendMessage(from, {
                react: { text: '❌', key: message.key }
            });
            await reply(`❌ *Error*\n\n${error.message}`);
        }
    }
};

// ============================================
// APK SEARCH FUNCTIONS
// ============================================

async function searchApkPure(appName) {
    try {
        const searchUrl = `https://apkpure.com/search?q=${encodeURIComponent(appName)}`;
        
        const response = await axios.get(`https://d.apkpure.com/api/v1/search?q=${encodeURIComponent(appName)}&limit=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        if (response.data && response.data.data && response.data.data.length > 0) {
            const app = response.data.data[0];
            return {
                name: app.title || appName,
                version: app.version || 'Latest',
                size: app.size || 'Unknown',
                package: app.package || 'Unknown',
                downloadUrl: `https://apkpure.com/download?package=${app.package || ''}`,
                source: 'ApkPure'
            };
        }
        
        const webResponse = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        const packageMatch = webResponse.data.match(/data-package=['"]([^'"]+)['"]/);
        if (packageMatch) {
            return {
                name: appName,
                version: 'Latest',
                package: packageMatch[1],
                downloadUrl: `https://apkpure.com/download?package=${packageMatch[1]}`,
                source: 'ApkPure (Fallback)'
            };
        }
        
        throw new Error('No APK found on ApkPure');
        
    } catch (error) {
        console.error('ApkPure search error:', error.message);
        throw error;
    }
}

async function searchApkMirror(appName) {
    try {
        const searchUrl = `https://www.apkmirror.com/?s=${encodeURIComponent(appName)}`;
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        const appMatch = response.data.match(/<a href="([^"]+)"[^>]*class="[^"]*appRow[^"]*">([^<]+)<\/a>/);
        
        if (appMatch && appMatch[1]) {
            const downloadUrl = `https://www.apkmirror.com${appMatch[1]}`;
            return {
                name: appMatch[2] || appName,
                version: 'Latest',
                size: 'Unknown',
                package: 'Unknown',
                downloadUrl: downloadUrl,
                source: 'ApkMirror'
            };
        }
        
        throw new Error('No APK found on ApkMirror');
        
    } catch (error) {
        console.error('ApkMirror search error:', error.message);
        throw error;
    }
}

async function searchApkCombo(appName) {
    try {
        const sources = [
            {
                url: `https://apkcombo.com/search?q=${encodeURIComponent(appName)}`,
                name: 'APKCombo'
            },
            {
                url: `https://apk.support/search/${encodeURIComponent(appName)}`,
                name: 'APKSupport'
            }
        ];
        
        for (const source of sources) {
            try {
                const response = await axios.get(source.url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });
                
                const downloadMatch = response.data.match(/<a[^>]*href=['"]([^'"]+\.apk)['"][^>]*>/i);
                if (downloadMatch) {
                    return {
                        name: appName,
                        version: 'Latest',
                        size: 'Unknown',
                        package: 'Unknown',
                        downloadUrl: downloadMatch[1].startsWith('http') ? downloadMatch[1] : `https://apkcombo.com${downloadMatch[1]}`,
                        source: source.name
                    };
                }
            } catch (e) {
                continue;
            }
        }
        
        throw new Error('No APK found from any source');
        
    } catch (error) {
        console.error('APKCombo search error:', error.message);
        throw error;
    }
}

async function downloadApk(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 200 * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/vnd.android.package-archive,*/*'
            }
        });
        
        if (!response.data || response.data.length < 1000) {
            throw new Error('Downloaded file is too small');
        }
        
        return Buffer.from(response.data);
        
    } catch (error) {
        console.error('APK download error:', error.message);
        throw error;
    }
}