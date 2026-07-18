const crypto = require('crypto');
const {
    generateWAMessageContent,
    generateWAMessageFromContent,
    downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const { PassThrough } = require('stream');
const ffmpeg = require('fluent-ffmpeg');

const PURPLE_COLOR = '#9C27B0';

module.exports = {
    pattern: "groupstatus",
    alias: ["togstatus", "swgc", "gs", "gstatus"],
    desc: "Post replied media or text as a WhatsApp group status",
    category: "admin",
    react: "📱",
    filename: __filename,
    use: ".groupstatus [caption] (reply to image/video/audio) OR .groupstatus your text",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            const args = m.args || [];
            const caption = (args.join(' ') || '').trim();

            const ctxInfo = message.message?.extendedTextMessage?.contextInfo;
            const hasQuoted = !!ctxInfo?.quotedMessage;

            if (!hasQuoted) {
                if (!caption) {
                    return reply(
                        '📝 *Group Status Usage*\n\n' +
                        '• Reply to image/video/audio with:\n' +
                        '  `.groupstatus [optional caption]`\n' +
                        '• Or send text status only:\n' +
                        '  `.groupstatus Your text here`\n\n' +
                        'Text statuses use a single purple background color by default.'
                    );
                }

                await reply('⏳ Posting text group status...');

                try {
                    await groupStatus(conn, from, {
                        text: caption,
                        backgroundColor: PURPLE_COLOR,
                    });
                    await reply('✅ Text group status posted!');
                    if (module.exports.react) {
                        await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                    }
                    return;
                } catch (e) {
                    console.error('[groupstatus] text error:', e);
                    return reply('❌ Failed to post text group status: ' + (e.message || e));
                }
            }

            const targetMessage = {
                key: {
                    remoteJid: from,
                    id: ctxInfo.stanzaId,
                    participant: ctxInfo.participant,
                },
                message: ctxInfo.quotedMessage,
            };

            const mtype = Object.keys(targetMessage.message)[0] || '';

            const downloadBuf = async () => {
                const qmsg = targetMessage.message;
                if (/image/i.test(mtype)) return await downloadMedia(qmsg, 'image');
                if (/video/i.test(mtype)) return await downloadMedia(qmsg, 'video');
                if (/audio/i.test(mtype)) return await downloadMedia(qmsg, 'audio');
                if (/sticker/i.test(mtype)) return await downloadMedia(qmsg, 'sticker');
                return null;
            };

            if (/image|sticker/i.test(mtype)) {
                await reply('⏳ Posting image group status...');
                let buf;
                try {
                    buf = await downloadBuf();
                } catch {
                    return reply('❌ Failed to download image');
                }
                if (!buf) return reply('❌ Could not download image');

                try {
                    await groupStatus(conn, from, {
                        image: buf,
                        caption: caption || '',
                    });
                    await reply('✅ Image group status posted!');
                    if (module.exports.react) {
                        await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                    }
                    return;
                } catch (e) {
                    console.error('[groupstatus] image error:', e);
                    return reply('❌ Failed to post image group status: ' + (e.message || e));
                }
            }

            if (/video/i.test(mtype)) {
                await reply('⏳ Posting video group status...');
                let buf;
                try {
                    buf = await downloadBuf();
                } catch {
                    return reply('❌ Failed to download video');
                }
                if (!buf) return reply('❌ Could not download video');

                try {
                    await groupStatus(conn, from, {
                        video: buf,
                        caption: caption || '',
                    });
                    await reply('✅ Video group status posted!');
                    if (module.exports.react) {
                        await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                    }
                    return;
                } catch (e) {
                    console.error('[groupstatus] video error:', e);
                    return reply('❌ Failed to post video group status: ' + (e.message || e));
                }
            }

            if (/audio/i.test(mtype)) {
                await reply('⏳ Posting audio group status...');
                let buf;
                try {
                    buf = await downloadBuf();
                } catch {
                    return reply('❌ Failed to download audio');
                }
                if (!buf) return reply('❌ Could not download audio');

                let vn;
                try {
                    vn = await toVN(buf);
                } catch {
                    vn = buf;
                }

                let waveform;
                try {
                    waveform = await generateWaveform(buf);
                } catch {
                    waveform = undefined;
                }

                try {
                    await groupStatus(conn, from, {
                        audio: vn,
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true,
                        waveform,
                    });
                    await reply('✅ Audio group status posted!');
                    if (module.exports.react) {
                        await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
                    }
                    return;
                } catch (e) {
                    console.error('[groupstatus] audio error:', e);
                    return reply('❌ Failed to post audio group status: ' + (e.message || e));
                }
            }

            return reply('❌ Unsupported media type. Reply to an image, video, or audio.');
        } catch (e) {
            console.error('[groupstatus] error:', e);
            return reply('❌ Error: ' + (e.message || e));
        }
    }
};

// ---- Helpers ----

async function downloadMedia(msg, type) {
    const mediaMsg = msg[`${type}Message`] || msg;
    const stream = await downloadContentFromMessage(mediaMsg, type);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function groupStatus(sock, jid, content) {
    const { backgroundColor } = content;
    delete content.backgroundColor;

    const inside = await generateWAMessageContent(content, {
        upload: sock.waUploadToServer,
        backgroundColor: backgroundColor || PURPLE_COLOR,
    });

    const secret = crypto.randomBytes(32);

    const msg = generateWAMessageFromContent(
        jid,
        {
            messageContextInfo: { messageSecret: secret },
            groupStatusMessageV2: {
                message: {
                    ...inside,
                    messageContextInfo: { messageSecret: secret },
                },
            },
        },
        {}
    );

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
}

function toVN(buffer) {
    return new Promise((resolve, reject) => {
        const input = new PassThrough();
        const output = new PassThrough();
        const chunks = [];

        input.end(buffer);

        ffmpeg(input)
            .noVideo()
            .audioCodec('libopus')
            .format('ogg')
            .audioChannels(1)
            .audioFrequency(48000)
            .on('error', reject)
            .on('end', () => resolve(Buffer.concat(chunks)))
            .pipe(output);

        output.on('data', (c) => chunks.push(c));
    });
}

function generateWaveform(buffer, bars = 64) {
    return new Promise((resolve, reject) => {
        const input = new PassThrough();
        input.end(buffer);

        const chunks = [];

        ffmpeg(input)
            .audioChannels(1)
            .audioFrequency(16000)
            .format('s16le')
            .on('error', reject)
            .on('end', () => {
                const raw = Buffer.concat(chunks);
                const samples = raw.length / 2;
                const amps = [];

                for (let i = 0; i < samples; i++) {
                    amps.push(Math.abs(raw.readInt16LE(i * 2)) / 32768);
                }

                const size = Math.floor(amps.length / bars);
                if (size === 0) return resolve(undefined);

                const avg = Array.from({ length: bars }, (_, i) =>
                    amps
                        .slice(i * size, (i + 1) * size)
                        .reduce((a, b) => a + b, 0) / size
                );

                const max = Math.max(...avg);
                if (max === 0) return resolve(undefined);

                resolve(
                    Buffer.from(
                        avg.map((v) => Math.floor((v / max) * 100))
                    ).toString('base64')
                );
            })
            .pipe()
            .on('data', (c) => chunks.push(c));
    });
}