/**
 * AutoStatus Command - View & react to status updates automatically
 */

const { load, save } = require('../../lib/utils/autostatus');

module.exports = {
    pattern: "autostatus",
    alias: ["astatus", "asv"],
    desc: "Auto view and react to status updates (owner only)",
    category: "owner",
    react: "📱",
    filename: __filename,
    use: ".autostatus [view on/off] [react on/off] [reaction <emoji>]",
    
    execute: async (conn, message, m, { from, isGroup, reply, isOwner }) => {
        try {
            if (!isOwner) return reply("❌ Only owner can use this command.");

            const args = m.args || [];
            const cfg = load();

            if (!args[0]) {
                let privacyNote = '';
                try {
                    const privacy = await conn.fetchPrivacySettings?.();
                    const rr = privacy?.readreceipts || 'unknown';
                    privacyNote = rr !== 'all'
                        ? `\n⚠️ Bot read receipts: *${rr}* – status poster may NOT see views. Use \`.autostatus readreceipts on\` to fix.`
                        : `\n✅ Bot read receipts: ${rr}`;
                } catch (_) {}
                return reply(
                    `📱 *AutoStatus*\n\n` +
                    `View: *${cfg.view ? 'ON' : 'OFF'}* – Bot views status immediately\n` +
                    `React: *${cfg.react ? 'ON' : 'OFF'}* – Bot reacts to status\n` +
                    `Reaction: ${cfg.reaction}` +
                    privacyNote + `\n\n*Usage:*\n` +
                    `  .autostatus view on\n` +
                    `  .autostatus view off\n` +
                    `  .autostatus react on\n` +
                    `  .autostatus react off\n` +
                    `  .autostatus reaction 💚\n` +
                    `  .autostatus readreceipts on  (so status poster sees the view)`
                );
            }

            const sub = args[0].toLowerCase();
            const val = args[1]?.toLowerCase();

            if (sub === 'view') {
                if (val === 'on') {
                    cfg.view = true;
                    save(cfg);
                    return reply('✅ AutoStatus *view* is ON. Bot will view status updates immediately.');
                }
                if (val === 'off') {
                    cfg.view = false;
                    save(cfg);
                    return reply('❌ AutoStatus *view* is OFF.');
                }
                return reply('Usage: .autostatus view <on/off>');
            }

            if (sub === 'react') {
                if (val === 'on') {
                    cfg.react = true;
                    save(cfg);
                    return reply(`✅ AutoStatus *react* is ON. Bot will react with ${cfg.reaction}.`);
                }
                if (val === 'off') {
                    cfg.react = false;
                    save(cfg);
                    return reply('❌ AutoStatus *react* is OFF.');
                }
                return reply('Usage: .autostatus react <on/off>');
            }

            if (sub === 'reaction') {
                const emoji = args[1]?.trim();
                if (!emoji) {
                    return reply(`Current reaction: ${cfg.reaction}\nUsage: .autostatus reaction <emoji>`);
                }
                cfg.reaction = emoji;
                save(cfg);
                return reply(`✅ AutoStatus reaction set to ${emoji}`);
            }

            if (sub === 'readreceipts') {
                if (val === 'on') {
                    try {
                        await conn.updateReadReceiptsPrivacy?.('all');
                        return reply('✅ Bot read receipts enabled. Status poster will now see when bot views their status.');
                    } catch (e) {
                        return reply('❌ Failed: ' + (e?.message || e));
                    }
                }
                if (val === 'off') {
                    try {
                        await conn.updateReadReceiptsPrivacy?.('none');
                        return reply('❌ Bot read receipts disabled.');
                    } catch (e) {
                        return reply('❌ Failed: ' + (e?.message || e));
                    }
                }
                return reply('Usage: .autostatus readreceipts <on/off>');
            }

            return reply('❌ Invalid option. Use: view | react | reaction | readreceipts');
        } catch (err) {
            console.error('[autostatus] error:', err);
            return reply('❌ Error updating autostatus.');
        }
    }
};