// CouchChat: auto-join after the host gate. Before the reload the typed name and the mic/cam choice are stored under
// sessionStorage.cc_gate_autojoin (JSON, bound to the room). The next page load reads it exactly once (the flag is
// removed on read, i.e. before joining, so a failing join can never loop) and skips the prejoin dialog.
function ccAutoJoinSave() {
    try {
        const name = String(myPeerName || '').trim();
        if (!name) return; // nothing typed yet: the user simply sees the prejoin screen again
        window.sessionStorage.setItem(
            'cc_gate_autojoin',
            JSON.stringify({ room: String(roomId), name: name, audio: !!myAudioStatus, video: !!myVideoStatus })
        );
    } catch (e) {
        /* storage not available */
    }
}

function ccAutoJoinTake() {
    if (window.ccAutoJoin !== undefined) return window.ccAutoJoin;
    window.ccAutoJoin = null;
    try {
        const raw = window.sessionStorage.getItem('cc_gate_autojoin');
        window.sessionStorage.removeItem('cc_gate_autojoin');
        const data = raw ? JSON.parse(raw) : null;
        if (data && data.room === String(roomId) && typeof data.name === 'string' && data.name.trim()) {
            window.ccAutoJoin = data;
        }
    } catch (e) {
        /* storage not available or broken value */
    }
    return window.ccAutoJoin;
}

function ccAutoJoinMedia(kind) {
    const data = ccAutoJoinTake();
    if (!data || typeof data[kind] !== 'boolean') return null;
    return data[kind] ? '1' : '0';
}

function handleUnauthorized() {
    // CouchChat: host-protected room that is not open yet, or a rejected/expired token. A rejected token is useless,
    // drop it so the user can log in again. One modal: waiting status (polls /isRoomActive) + host login.
    try {
        window.sessionStorage.removeItem('peer_token');
    } catch (e) {
        /* storage not available */
    }
    if (window.ccGateOpen) return; // repeated 'unauthorized' events must not stack dialogs
    window.ccGateOpen = true;
    playSound('alert');

    let pollTimer = null;
    let reloading = false;
    const stopPolling = () => {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    };
    const reloadOnce = () => {
        if (reloading) return;
        reloading = true;
        stopPolling();
        ccAutoJoinSave();
        window.location.reload();
    };
    const pollRoom = async () => {
        try {
            const res = await axios.post('/isRoomActive', { roomId: roomId });
            if (res.data && res.data.message === true) reloadOnce();
        } catch (e) {
            /* server not reachable right now: try again with the next tick */
        }
    };

    Swal.fire({
        allowOutsideClick: false,
        allowEscapeKey: false,
        background: swBg,
        title: 'Warten auf den Gastgeber',
        customClass: { popup: 'cc-gate' },
        html:
            '<div class="cc-gate-body">' +
            '<p class="cc-gate-status" role="status" aria-live="polite"><span class="cc-gate-spinner" aria-hidden="true"></span>' +
            'Das Meeting hat noch nicht begonnen. Sie werden automatisch verbunden, sobald der Gastgeber den Raum öffnet.</p>' +
            '<hr class="cc-gate-sep" />' +
            '<h3 class="cc-gate-heading">Sie sind der Gastgeber?</h3>' +
            '<label class="cc-gate-label" for="ccGateUser">Benutzername</label>' +
            '<input class="cc-gate-input" id="ccGateUser" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" />' +
            '<label class="cc-gate-label" for="ccGatePass">Passwort</label>' +
            '<input class="cc-gate-input" id="ccGatePass" type="password" autocomplete="current-password" />' +
            '</div>',
        showCancelButton: false,
        confirmButtonText: 'Anmelden und Raum öffnen',
        showLoaderOnConfirm: true,
        focusConfirm: false,
        showClass: { popup: 'animate__animated animate__fadeInDown' },
        hideClass: { popup: 'animate__animated animate__fadeOutUp' },
        didOpen: () => {
            for (const id of ['ccGateUser', 'ccGatePass']) {
                const el = document.getElementById(id);
                if (!el) continue;
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        Swal.clickConfirm();
                    }
                });
            }
            pollTimer = setInterval(pollRoom, 3000);
        },
        willClose: stopPolling,
        preConfirm: async () => {
            const username = (document.getElementById('ccGateUser')?.value || '').trim();
            const password = document.getElementById('ccGatePass')?.value || '';
            if (!username || !password) {
                Swal.showValidationMessage('Bitte geben Sie Benutzername und Passwort ein.');
                return false;
            }
            try {
                const res = await axios.post('/login', { username, password });
                const allowed = res.data && res.data.allowedRooms;
                if (Array.isArray(allowed) && !allowed.includes('*') && !allowed.includes(String(roomId))) {
                    Swal.showValidationMessage('Für diesen Raum fehlt Ihnen die Berechtigung.');
                    return false;
                }
                window.sessionStorage.peer_token = res.data.message;
                return true;
            } catch (err) {
                const status = err && err.response && err.response.status;
                if (status === 401) Swal.showValidationMessage('Benutzername oder Passwort falsch.');
                else if (status === 429)
                    Swal.showValidationMessage('Zu viele Anmeldeversuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.');
                else if (status === 400)
                    Swal.showValidationMessage('Bitte prüfen Sie Ihre Eingaben (Benutzername und Passwort, höchstens 36 Zeichen).');
                else Swal.showValidationMessage('Die Anmeldung ist fehlgeschlagen. Bitte versuchen Sie es erneut.');
                return false;
            }
        },
    }).then((result) => {
        // logged in: reload, the join is retried with the stored peer_token
        if (result.isConfirmed) reloadOnce();
    });
}
