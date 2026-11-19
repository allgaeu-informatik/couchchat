// 45-host-users: host users from a JSON file (HOST_USERS_FILE) with scrypt password hashes.
//
// The CouchChat admin panel writes host-users.json (atomic rename) into a directory that is mounted read-only into this
// container. This module makes the server
//   - load the users ONLY from that file when env HOST_USERS_FILE is set (HOST_USERS is then ignored, logged),
//   - re-read it while running (statSync on every login attempt; changed inode/mtime/ctime/size -> reload, errors keep the old list),
//   - verify "scrypt$N$r$p$salt$key" hashes (password NFC-normalized) and, for accounts imported from Jitsi/Prosody, "scram-sha1$iterations$salt$storedKeyHex"
//     hashes (RFC 5802) with timingSafeEqual (small in-memory cache of
//     successes, dummy scrypt for unknown usernames, per-username failure throttle),
//   - keep the user list (hashes) out of hostCfg: upstream logs 'Server config' including hostCfg at startup,
//   - accept login passwords up to 128 characters (upstream: 36).
// Without HOST_USERS_FILE the upstream behaviour (HOST_USERS with plaintext passwords) is unchanged.
//
// Files: data/host-users-loader.js is copied to app/src/hostUsersFile.js. server.js and validate.js are patched with
// explicit anchors. Runs after 40-server (anchors below do not overlap with its edits).

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const name = '45-host-users';

const LOADER = fs
    .readFileSync(fileURLToPath(new URL('./data/host-users-loader.js', import.meta.url)), 'utf8')
    .replace(/\r\n/g, '\n');

export default async function (ctx) {
    const srv = ctx.scope('app/src');

    srv.write('hostUsersFile.js', LOADER);
    ctx.currentFile = 'app/src/hostUsersFile.js';
    ctx.log('added hostUsersFile.js');

    // ---- validate.js: login password length 128 ------------------------------------------------------
    {
        let s = srv.read('validate.js');
        s = ctx.replaceOnce(s, 'const MAX_PASSWORD_LENGTH = 36;', 'const MAX_PASSWORD_LENGTH = 128;', 'validate.js: MAX_PASSWORD_LENGTH 128');
        srv.write('validate.js', s);
    }

    // ---- server.js ------------------------------------------------------------------------------------
    {
        let s = srv.read('server.js');
        const R = (find, repl, label, n = 1) => (s = ctx.replaceN(s, find, repl, `server.js: ${label}`, n));

        R(
            "const { parseHostUsers, isRoomAllowedForUser } = require('./hostUsers');",
            "const { parseHostUsers, isRoomAllowedForUser } = require('./hostUsers');\n" +
                "const { createHostUsersFile } = require('./hostUsersFile');\n" +
                '// Host users from a file written by the admin panel (HOST_USERS_FILE); unset = upstream HOST_USERS behaviour\n' +
                'const hostUsersFile = process.env.HOST_USERS_FILE\n' +
                "    ? createHostUsersFile({ file: process.env.HOST_USERS_FILE, log: new Logs('hostUsersFile') })\n" +
                '    : null;\n' +
                "if (hostUsersFile && process.env.HOST_USERS) new Logs('hostUsersFile').info('HOST_USERS_FILE is set, HOST_USERS is ignored');",
            'require hostUsersFile'
        );

        R(
            '    users: parseHostUsers(\n        Array.isArray(config.host.users) && config.host.users.length ? config.host.users : process.env.HOST_USERS\n    ),',
            '    // File mode: the list (with password hashes) stays inside hostUsersFile and never in hostCfg, because upstream\n' +
                "    // logs 'Server config' (incl. hostCfg) at startup.\n" +
                '    users: hostUsersFile\n' +
                '        ? []\n' +
                '        : parseHostUsers(\n' +
                '              Array.isArray(config.host.users) && config.host.users.length ? config.host.users : process.env.HOST_USERS\n' +
                '          ),',
            'hostCfg.users from file'
        );

        R(
            '!user || !Validate.isValidPassword(user.password)))',
            '!user || !(user.password_hash || Validate.isValidPassword(user.password))))',
            'startup validation skips hashed entries'
        );

        R(
            '    if (!Array.isArray(hostCfg.users)) return null;\n    return hostCfg.users.find((user) => user && user.username === username && user.password === password) || null;',
            '    if (hostUsersFile) return hostUsersFile.getAuthPeer(username, password);\n' +
                '    if (!Array.isArray(hostCfg.users)) return null;\n' +
                '    return hostCfg.users.find((user) => user && user.username === username && user.password === password) || null;',
            'getAuthPeer file lookup'
        );

        R(
            '!hostCfg.users.length && !OIDC.enabled',
            '!(hostUsersFile ? hostUsersFile.users().length : hostCfg.users.length) && !OIDC.enabled',
            'empty-users warning counts file users'
        );

        srv.write('server.js', s);
    }
}
