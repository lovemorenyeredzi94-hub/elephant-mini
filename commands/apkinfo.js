/**
 * APK Info - Get information about an app
 */

const axios = require('axios');

module.exports = {
    pattern: "apkinfo",
    alias: ["appinfo", "appdetails"],
    desc: "Get information about an app",
    category: "media",
    react: "📱",
    filename: __filename,
    use: ".apkinfo <app name>",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            const args = m.args || [];
            const text = args.join(' ');
            
            if (!text) {
                return await reply(
                    `📱 *App Info*\n\n` +
                    `Usage: .apkinfo <app name>\n` +
                    `Example: .apkinfo WhatsApp`
                );
            }
            
            const appName = text.trim();
            
            if (!appName) {
                return await reply(
                    `❌ Please provide an app name.\n\n` +
                    `Example: .apkinfo WhatsApp`
                );
            }
            
            await conn.sendMessage(from, {
                react: { text: '🔍', key: message.key }
            });
            
            let appInfo = null;
            
            try {
                appInfo = await getAppInfo(appName);
            } catch (error) {
                console.error('App info error:', error.message);
            }
            
            if (!appInfo) {
                await conn.sendMessage(from, {
                    react: { text: '❌', key: message.key }
                });
                return await reply(
                    `❌ *App Not Found*\n\n` +
                    `Could not find information for "${appName}".\n\n` +
                    `💡 Try:\n` +
                    `• Using the full app name\n` +
                    `• Checking the spelling\n` +
                    `• Searching on Google Play Store`
                );
            }
            
            await conn.sendMessage(from, {
                react: { text: '✅', key: message.key }
            });
            
            const botName = process.env.BOT_NAME || 'QADEER-XD MINI';
            const infoText = 
                `📱 *App Information*\n\n` +
                `📌 *Name:* ${appInfo.name || appName}\n` +
                (appInfo.package ? `📋 *Package:* ${appInfo.package}\n` : '') +
                (appInfo.version ? `📦 *Version:* ${appInfo.version}\n` : '') +
                (appInfo.size ? `📏 *Size:* ${appInfo.size}\n` : '') +
                (appInfo.installs ? `📊 *Installs:* ${appInfo.installs}\n` : '') +
                (appInfo.rating ? `⭐ *Rating:* ${appInfo.rating}\n` : '') +
                (appInfo.category ? `🏷️ *Category:* ${appInfo.category}\n` : '') +
                (appInfo.description ? `\n📝 *Description:*\n${appInfo.description.substring(0, 200)}...\n` : '') +
                `\n╰─━─━─━─━─━─━─━─━─━─━╯\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}*`;
            
            await reply(infoText);
            
        } catch (error) {
            console.error('[apkinfo] error:', error);
            await reply(`❌ Error: ${error.message}`);
        }
    }
};

async function getAppInfo(appName) {
    try {
        const response = await axios.get(`https://play.google.com/store/search?q=${encodeURIComponent(appName)}&c=apps`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const packageMatch = response.data.match(/<a[^>]*href="\/store\/apps\/details\?id=([^"]+)"[^>]*>/);
        if (packageMatch) {
            const packageName = packageMatch[1];
            
            const detailResponse = await axios.get(`https://play.google.com/store/apps/details?id=${packageName}&hl=en`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            
            const html = detailResponse.data;
            
            const nameMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([^<]+)<\/h1>/);
            const versionMatch = html.match(/<span[^>]*itemprop="softwareVersion"[^>]*>([^<]+)<\/span>/);
            const sizeMatch = html.match(/<div[^>]*itemprop="fileSize"[^>]*>([^<]+)<\/div>/);
            const installsMatch = html.match(/(\d+[\+,]?\d*)\s*installs?/i);
            const ratingMatch = html.match(/<div[^>]*itemprop="ratingValue"[^>]*>([^<]+)<\/div>/);
            const categoryMatch = html.match(/<a[^>]*href="\/store\/apps\/category\/([^"]+)"[^>]*>/);
            
            return {
                name: nameMatch ? nameMatch[1].trim() : appName,
                package: packageName,
                version: versionMatch ? versionMatch[1].trim() : 'Unknown',
                size: sizeMatch ? sizeMatch[1].trim() : 'Unknown',
                installs: installsMatch ? installsMatch[1] : 'Unknown',
                rating: ratingMatch ? ratingMatch[1].trim() : 'Unknown',
                category: categoryMatch ? categoryMatch[1].trim() : 'Unknown',
                description: html.match(/<div[^>]*itemprop="description"[^>]*>([^<]+)<\/div>/)?.[1]?.trim() || 'No description'
            };
        }
        
        throw new Error('App not found');
        
    } catch (error) {
        console.error('App info error:', error.message);
        return null;
    }
}