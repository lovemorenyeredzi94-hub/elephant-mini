/**
 * Newsletter Command - Get newsletter information from WhatsApp channel link
 */

function getChannelInviteCode(link) {
    try {
        let cleanLink = link.trim();
        cleanLink = cleanLink.split('?')[0].split('#')[0];
        
        try {
            const url = new URL(cleanLink);
            const parts = url.pathname.split('/').filter(Boolean);
            const code = parts[parts.length - 1];
            if (code && code.length > 0) {
                return code;
            }
        } catch (urlError) {}
        
        const patterns = [
            /(?:whatsapp\.com|wa\.me)\/channel\/([A-Za-z0-9]+)/i,
            /\/channel\/([A-Za-z0-9]+)/i,
            /channel\/([A-Za-z0-9]+)/i
        ];
        
        for (const pattern of patterns) {
            const match = cleanLink.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        if (/^[A-Za-z0-9]+$/.test(cleanLink)) {
            return cleanLink;
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting invite code:', error);
        return null;
    }
}

module.exports = {
    pattern: "newsletter",
    alias: ["channel", "channelinfo", "nl"],
    desc: "Get newsletter information from WhatsApp channel link",
    category: "owner",
    react: "📰",
    filename: __filename,
    use: ".newsletter <channel link>",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            const text = args.join(' ');
            
            if (!text || text.trim().length === 0) {
                return reply('❌ Please provide a WhatsApp channel link!\n\nExample: .newsletter https://whatsapp.com/channel/0029VaAbCdEfGhIJkL');
            }
            
            const inviteCode = getChannelInviteCode(text);
            
            if (!inviteCode) {
                return reply('❌ Could not extract invite code from the link!\n\nPlease provide a valid WhatsApp channel link.\nExample: https://whatsapp.com/channel/0029VaAbCdEfGhIJkL');
            }
            
            try {
                const meta = await conn.newsletterMetadata('invite', inviteCode);
                
                if (!meta) {
                    throw new Error('Newsletter not found');
                }
                
                let infoText = `📰 *NEWSLETTER INFO*\n\n`;
                infoText += `📌 *ID:* ${meta.id || 'N/A'}\n`;
                
                if (meta.description) {
                    infoText += `📝 *Description:* ${meta.description}\n`;
                }
                
                if (meta.invite) {
                    infoText += `🔗 *Invite Code:* \`${meta.invite}\`\n`;
                }
                
                if (meta.subscriberCount !== undefined) {
                    infoText += `👥 *Subscribers:* ${meta.subscriberCount.toLocaleString()}\n`;
                }
                
                if (meta.creationTime) {
                    const date = new Date(meta.creationTime * 1000);
                    infoText += `📅 *Created:* ${date.toLocaleDateString()}\n`;
                }
                
                if (meta.image) {
                    await conn.sendMessage(from, {
                        image: { url: meta.image },
                        caption: infoText
                    }, { quoted: message });
                } else {
                    await reply(infoText);
                }

                if (module.exports.react) {
                    await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                }
            } catch (error) {
                console.error('[newsletter] error:', error);
                await reply(`❌ Failed to get newsletter information: ${error.message}`);
            }
        } catch (error) {
            console.error('[newsletter] error:', error);
            await reply(`❌ An error occurred: ${error.message}`);
        }
    }
};