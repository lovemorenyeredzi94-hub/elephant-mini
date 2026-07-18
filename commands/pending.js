/**
 * Pending Requests Command - List all pending member join requests in a group
 */

module.exports = {
    pattern: "pending",
    alias: ["pendingrequests", "joinrequests", "listpending"],
    desc: "List all pending member join requests in the group",
    category: "admin",
    react: "📋",
    filename: __filename,
    use: ".pending",
    
    execute: async (conn, message, m, { from, isGroup, reply }) => {
        try {
            if (!isGroup) return reply("❌ This command can only be used in groups.");

            if (!m.isAdmin && !m.isOwner) {
                return reply("❌ Only admins can use this command.");
            }

            let list;
            try {
                list = await conn.groupRequestParticipantsList(from);
            } catch (error) {
                console.error('Pending requests error:', error);
                if (error.message && (error.message.includes('403') || error.message.includes('forbidden'))) {
                    return reply('❌ Bot does not have permission to view join requests. Ensure join approval is enabled for the group.');
                }
                return reply('❌ Failed to fetch pending requests. ' + (error.message || 'Try again later.'));
            }

            if (!list || list.length === 0) {
                return reply('✅ *No pending join requests.*\n\nThere are no members waiting for approval.');
            }

            let text = `📋 *Pending Join Requests* (${list.length})\n\n`;
            text += `The following ${list.length} request(s) are waiting for approval:\n\n`;

            const mentionJids = [];

            list.forEach((p, i) => {
                const rawJid = p.jid || p.pn || p.lid;
                if (!rawJid) {
                    text += `${i + 1}. Unknown\n`;
                    return;
                }
                const name = (p.notify || p.name || '').trim();
                const pnJid = p.phone_number || (p.pn && p.pn.includes('@s.whatsapp.net') ? p.pn : null) || (p.jid && p.jid.includes('@s.whatsapp.net') ? p.jid : null);
                const hasRealNumber = pnJid && pnJid.includes('@s.whatsapp.net');

                if (hasRealNumber) {
                    const displayLabel = name || pnJid.split('@')[0];
                    const jidForMention = pnJid.includes('@') ? pnJid : `${pnJid.split('@')[0]}@s.whatsapp.net`;
                    mentionJids.push(jidForMention);
                    text += `${i + 1}. @${displayLabel}\n`;
                    return;
                }

                const normalized = rawJid.includes('@') ? rawJid : `${rawJid}@s.whatsapp.net`;
                if (normalized && normalized.includes('@s.whatsapp.net')) {
                    const displayLabel = name || normalized.split('@')[0];
                    mentionJids.push(normalized);
                    text += `${i + 1}. @${displayLabel}\n`;
                    return;
                }

                text += `${i + 1}. ${name || 'Pending user (ID only)'}\n`;
            });

            await conn.sendMessage(from, { text, mentions: mentionJids }, { quoted: message });

            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: message.key } });
            }
        } catch (error) {
            console.error('[pending] error:', error);
            await reply('❌ Error: ' + (error.message || 'Unknown error occurred'));
        }
    }
};