/**
 * HideTag Command - Silently tag all group members
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
    pattern: "hidetag",
    alias: ["tag"],
    desc: "Silently tag all members in the group",
    category: "admin",
    react: "👥",
    filename: __filename,
    use: ".tag <message> (or reply to media)",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const groupMetadata = await conn.groupMetadata(from);
            const participants = groupMetadata.participants || [];
            const mentions = participants.map((p) => p.id || p.lid).filter(Boolean);

            const ctxInfo = message.message?.extendedTextMessage?.contextInfo;
            let targetMessage = message;

            if (ctxInfo?.quotedMessage) {
                targetMessage = {
                    key: {
                        remoteJid: from,
                        id: ctxInfo.stanzaId,
                        participant: ctxInfo.participant,
                    },
                    message: ctxInfo.quotedMessage,
                };
            }

            const mediaMessage = 
                targetMessage.message?.imageMessage ||
                targetMessage.message?.videoMessage ||
                targetMessage.message?.stickerMessage;

            const args = m.args || [];

            if (mediaMessage) {
                try {
                    const mediaBuffer = await downloadMediaMessage(
                        targetMessage,
                        'buffer',
                        {},
                        { logger: undefined, reuploadRequest: conn.updateMediaMessage }
                    );

                    if (targetMessage.message?.imageMessage) {
                        const text = args.join(' ') || targetMessage.message.imageMessage.caption || '';
                        await conn.sendMessage(from, {
                            image: mediaBuffer,
                            caption: text,
                            mentions
                        }, { quoted: message });
                    } else if (targetMessage.message?.videoMessage) {
                        const text = args.join(' ') || targetMessage.message.videoMessage.caption || '';
                        await conn.sendMessage(from, {
                            video: mediaBuffer,
                            caption: text,
                            mentions
                        }, { quoted: message });
                    } else if (targetMessage.message?.stickerMessage) {
                        await conn.sendMessage(from, {
                            sticker: mediaBuffer,
                            mentions
                        }, { quoted: message });
                        const text = args.join(' ');
                        if (text) {
                            await conn.sendMessage(from, { text, mentions }, { quoted: message });
                        }
                    }
                } catch (mediaError) {
                    console.error('Error downloading media for hidetag:', mediaError);
                    const text = args.join(' ') || ' ';
                    await conn.sendMessage(from, { text, mentions }, { quoted: message });
                }
            } else {
                if (ctxInfo?.quotedMessage) {
                    const quotedText = ctxInfo.quotedMessage.conversation || 
                                     ctxInfo.quotedMessage.extendedTextMessage?.text || 
                                     args.join(' ') || ' ';
                    await conn.sendMessage(from, { text: quotedText, mentions }, { quoted: message });
                } else {
                    const text = args.join(' ') || ' ';
                    await conn.sendMessage(from, { text, mentions }, { quoted: message });
                }
            }

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[hidetag] error:', error);
            await reply('❌ Failed to tag members.');
        }
    }
};