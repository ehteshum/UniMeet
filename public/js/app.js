/**
 * UniMeet — Homepage Logic (app.js)
 * ----------------------------------
 * Handles "New Meeting" and "Join" actions.
 * Passes user-chosen name via URL param.
 */

(function () {
    'use strict';

    const usernameInput = document.getElementById('username-input');

    /**
     * Get the trimmed username.
     */
    function getUserName() {
        return usernameInput.value.trim();
    }

    /**
     * Validate username input. Returns true if valid, false otherwise.
     */
    function validateUserName() {
        const name = getUserName();
        if (!name) {
            usernameInput.classList.add('error');
            usernameInput.focus();

            // Remove the animation class to allow re-triggering it
            setTimeout(() => {
                usernameInput.classList.remove('error');
            }, 400);
            return false;
        }
        return true;
    }

    /**
     * Build URL with room id and optional username.
     */
    function buildRoomUrl(roomId) {
        const name = getUserName();
        let url = `/room?id=${encodeURIComponent(roomId)}`;
        if (name) url += `&name=${encodeURIComponent(name)}`;
        return url;
    }

    /**
     * Generate a random room ID in the format: abc-defg-hij
     */
    function generateRoomId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const pick = (n) => {
            let s = '';
            for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return s;
        };
        return `${pick(3)}-${pick(4)}-${pick(3)}`;
    }

    // ── New Meeting ────────────────────────────────
    const btnNew = document.getElementById('btn-new-meeting');
    btnNew.addEventListener('click', () => {
        if (!validateUserName()) return;

        const roomId = generateRoomId();
        window.location.href = buildRoomUrl(roomId);
    });

    // ── Join Meeting ───────────────────────────────
    const btnJoin = document.getElementById('btn-join');
    const input = document.getElementById('join-input');

    function joinRoom() {
        if (!validateUserName()) return;

        let value = input.value.trim();
        if (!value) {
            input.focus();
            return;
        }
        // If user pasted a full URL, extract the id param
        if (value.includes('id=')) {
            try {
                const url = new URL(value, window.location.origin);
                value = url.searchParams.get('id') || value;
            } catch (_) { /* keep original value */ }
        }
        window.location.href = buildRoomUrl(value);
    }

    btnJoin.addEventListener('click', joinRoom);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinRoom();
    });
})();
