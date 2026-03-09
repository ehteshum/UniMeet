/**
 * UniMeet — Meeting Room Logic (room.js)
 * =======================================
 * WebRTC peer-to-peer video/audio with Socket.io signaling.
 * Mesh topology: every participant connects to every other.
 */

(function () {
    'use strict';

    // ── DOM References ───────────────────────────────
    const videoGrid = document.getElementById('video-grid');
    const localVideo = document.getElementById('local-video');
    const localMicIcon = document.getElementById('local-mic-icon');
    const localNameLabel = document.getElementById('local-name-label');
    const localPlaceholder = document.getElementById('local-placeholder');
    const localAvatarInit = document.getElementById('local-avatar-initials');
    const localPlaceName = document.getElementById('local-placeholder-name');
    const roomIdDisplay = document.getElementById('room-id-display');
    const participantCount = document.getElementById('participant-count');
    const userAvatar = document.getElementById('user-avatar');
    const loadingOverlay = document.getElementById('loading-overlay');
    const toastEl = document.getElementById('toast');

    // Sidebar
    const btnParticipants = document.getElementById('btn-participants');
    const sidebar = document.getElementById('sidebar-participants');
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    const sidebarList = document.getElementById('sidebar-list');
    const sidebarCount = document.getElementById('sidebar-count');

    // Toolbar buttons
    const btnMic = document.getElementById('btn-mic');
    const btnCamera = document.getElementById('btn-camera');
    const btnShare = document.getElementById('btn-share');
    const btnLeave = document.getElementById('btn-leave');
    const btnCopy = document.getElementById('btn-copy-room');
    const labelMic = document.getElementById('label-mic');
    const labelCamera = document.getElementById('label-camera');
    const labelShare = document.getElementById('label-share');

    // ── State ────────────────────────────────────────
    let localStream = null;
    let screenStream = null;
    let isMicOn = false;
    let isCameraOn = false;
    let isSharing = false;
    const peers = {};      // { peerId: RTCPeerConnection }
    const remoteStreams = {};      // { peerId: MediaStream }
    const peerNames = {};      // { peerId: userName }

    // ── Room ID & User ──────────────────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('id');
    if (!roomId) {
        window.location.href = '/';
        return;
    }

    // Read username from URL param (set on homepage), fallback to random guest name
    const guestNames = ['Falcon', 'Phoenix', 'Viper', 'Orion', 'Nova', 'Lynx', 'Comet', 'Blaze', 'Atlas', 'Echo'];
    const urlName = urlParams.get('name');
    const userName = urlName ? urlName : 'Guest ' + guestNames[Math.floor(Math.random() * guestNames.length)];

    // Set UI
    roomIdDisplay.textContent = roomId;
    localNameLabel.textContent = userName + ' (You)';
    const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    userAvatar.textContent = initials;
    localAvatarInit.textContent = initials;
    localPlaceName.textContent = userName;
    document.title = `UniMeet — ${roomId}`;

    // ── ICE Servers (free STUN/TURN) ─────────────────────
    const iceConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    };

    // ── Candidate Queue ─────────────────────────────
    // Stores ICE candidates received before the remote description is set
    const candidateQueue = {};

    // ── Socket.io ───────────────────────────────────
    const socket = io();

    // ── Helpers ─────────────────────────────────────
    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('toast--show');
        setTimeout(() => toastEl.classList.remove('toast--show'), 2500);
    }

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    // ── Create video tile for a remote peer ─────────
    function createRemoteTile(peerId, name) {
        const tile = document.createElement('div');
        tile.className = 'video-tile video-tile--no-mirror';
        tile.id = `tile-${peerId}`;

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.id = `video-${peerId}`;
        tile.appendChild(video);

        const label = document.createElement('div');
        label.className = 'video-tile__label';
        label.innerHTML = `
      <span class="material-symbols-outlined mic-on" id="mic-icon-${peerId}">mic</span>
      <span>${name || 'Guest'}</span>
    `;
        tile.appendChild(label);

        videoGrid.appendChild(tile);
        return video;
    }

    function removeRemoteTile(peerId) {
        const tile = document.getElementById(`tile-${peerId}`);
        if (tile) tile.remove();
    }

    // ── RTCPeerConnection per peer ──────────────────
    function createPeerConnection(peerId, peerName) {
        const pc = new RTCPeerConnection(iceConfig);

        // Add local tracks to the connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        // When we get ICE candidates, relay them
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    to: peerId,
                    candidate: event.candidate
                });
            }
        };

        // When we receive remote tracks
        pc.ontrack = (event) => {
            if (!remoteStreams[peerId]) {
                remoteStreams[peerId] = new MediaStream();
                const videoEl = document.getElementById(`video-${peerId}`) || createRemoteTile(peerId, peerName);
                videoEl.srcObject = remoteStreams[peerId];
            }
            remoteStreams[peerId].addTrack(event.track);

            // Make sure the video element has the stream
            const videoEl = document.getElementById(`video-${peerId}`);
            if (videoEl && videoEl.srcObject !== remoteStreams[peerId]) {
                videoEl.srcObject = remoteStreams[peerId];
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                closePeer(peerId);
            }
        };

        peers[peerId] = pc;
        peerNames[peerId] = peerName;
        candidateQueue[peerId] = [];
        return pc;
    }

    function closePeer(peerId) {
        if (peers[peerId]) {
            peers[peerId].close();
            delete peers[peerId];
        }
        delete remoteStreams[peerId];
        delete peerNames[peerId];
        delete candidateQueue[peerId];
        removeRemoteTile(peerId);
    }

    // ── Signaling handlers ──────────────────────────

    // A new user joins — we (the existing user) create an offer
    socket.on('user-joined', async ({ userId, userName: name }) => {
        showToast(`${name} joined`);
        peerNames[userId] = name;
        createRemoteTile(userId, name);
        const pc = createPeerConnection(userId, name);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { to: userId, offer });
        } catch (err) {
            console.error('Error creating offer:', err);
        }
    });

    // We (the newcomer) receive the list of existing users
    socket.on('existing-users', (users) => {
        users.forEach(({ userId, userName: name }) => {
            peerNames[userId] = name;
            createRemoteTile(userId, name);
            createPeerConnection(userId, name);
            // Existing users will send us offers
        });
    });

    // Receive an offer from a peer
    socket.on('offer', async ({ from, userName: name, offer }) => {
        if (!peers[from]) {
            createPeerConnection(from, name);
        }
        const pc = peers[from];

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            // Process any queued candidates
            if (candidateQueue[from] && candidateQueue[from].length > 0) {
                for (const cand of candidateQueue[from]) {
                    await pc.addIceCandidate(cand).catch(e => console.error('Error adding queued candidate:', e));
                }
                candidateQueue[from] = [];
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { to: from, answer });
        } catch (err) {
            console.error('Error handling offer:', err);
        }
    });

    // Receive an answer from a peer
    socket.on('answer', async ({ from, answer }) => {
        const pc = peers[from];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));

                // Process any queued candidates
                if (candidateQueue[from] && candidateQueue[from].length > 0) {
                    for (const cand of candidateQueue[from]) {
                        await pc.addIceCandidate(cand).catch(e => console.error('Error adding queued candidate:', e));
                    }
                    candidateQueue[from] = [];
                }
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        }
    });

    // Receive an ICE candidate
    socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = peers[from];
        if (pc) {
            try {
                const rtcCand = new RTCIceCandidate(candidate);
                // If remote description isn't set yet, queue the candidate
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(rtcCand);
                } else {
                    candidateQueue[from].push(rtcCand);
                }
            } catch (err) {
                console.error('Error adding/queuing ICE candidate:', err);
            }
        }
    });

    // A user left the room
    socket.on('user-left', ({ userId }) => {
        const name = peerNames[userId] || 'A participant';
        showToast(`${name} left`);
        closePeer(userId);
    });

    // Participant count update
    socket.on('participant-count', (count) => {
        participantCount.textContent = count;
        updateSidebar();
    });

    // ── Sidebar Logic ───────────────────────────────

    btnParticipants.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
    });

    btnCloseSidebar.addEventListener('click', () => {
        sidebar.classList.add('hidden');
    });

    function updateSidebar() {
        if (!sidebarList) return;
        sidebarList.innerHTML = '';

        const count = Object.keys(peers).length + 1;
        sidebarCount.textContent = count;

        // Add me
        const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const meItem = document.createElement('div');
        meItem.className = 'sidebar-item';
        meItem.innerHTML = `
            <div class="sidebar-item__avatar">${initials}</div>
            <div class="sidebar-item__name">${userName} (You)</div>
            <span class="material-symbols-outlined" style="color:var(--color-primary); font-size:1.1rem">person</span>
        `;
        sidebarList.appendChild(meItem);

        // Add peers
        for (const peerId in peerNames) {
            const pName = peerNames[peerId];
            const pInitials = pName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const peerItem = document.createElement('div');
            peerItem.className = 'sidebar-item';
            peerItem.innerHTML = `
                <div class="sidebar-item__avatar" style="background:var(--bg-muted); color:var(--text-secondary)">${pInitials}</div>
                <div class="sidebar-item__name">${pName}</div>
            `;
            sidebarList.appendChild(peerItem);
        }
    }

    // ── Controls ────────────────────────────────────

    // Mic toggle
    btnMic.addEventListener('click', () => {
        if (!localStream) return;
        isMicOn = !isMicOn;
        localStream.getAudioTracks().forEach(t => (t.enabled = isMicOn));

        const icon = btnMic.querySelector('.material-symbols-outlined');
        if (isMicOn) {
            icon.textContent = 'mic';
            btnMic.classList.remove('toolbar__btn-circle--off');
            labelMic.textContent = 'Mute';
            localMicIcon.textContent = 'mic';
            localMicIcon.className = 'material-symbols-outlined mic-on';
        } else {
            icon.textContent = 'mic_off';
            btnMic.classList.add('toolbar__btn-circle--off');
            labelMic.textContent = 'Unmute';
            localMicIcon.textContent = 'mic_off';
            localMicIcon.className = 'material-symbols-outlined mic-off';
        }
    });

    // Camera toggle
    btnCamera.addEventListener('click', () => {
        if (!localStream) return;
        isCameraOn = !isCameraOn;
        localStream.getVideoTracks().forEach(t => (t.enabled = isCameraOn));

        const icon = btnCamera.querySelector('.material-symbols-outlined');
        if (isCameraOn) {
            icon.textContent = 'videocam';
            btnCamera.classList.remove('toolbar__btn-circle--off');
            labelCamera.textContent = 'Stop Video';
            localVideo.style.display = 'block';
            localPlaceholder.style.display = 'none';
        } else {
            icon.textContent = 'videocam_off';
            btnCamera.classList.add('toolbar__btn-circle--off');
            labelCamera.textContent = 'Start Video';
            localVideo.style.display = 'none';
            localPlaceholder.style.display = 'flex';
        }
    });

    // Screen share
    btnShare.addEventListener('click', async () => {
        if (!isSharing) {
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];

                // Replace video track in all peer connections
                for (const peerId in peers) {
                    const sender = peers[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                }

                // Show screen share on local video
                localVideo.srcObject = screenStream;

                isSharing = true;
                btnShare.classList.add('toolbar__btn-circle--sharing');
                labelShare.textContent = 'Stop';
                showToast('Screen sharing started');

                // When user stops sharing via browser controls
                screenTrack.onended = () => stopSharing();
            } catch (err) {
                console.log('Screen share cancelled or error:', err);
            }
        } else {
            stopSharing();
        }
    });

    function stopSharing() {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }

        // Restore camera track
        const cameraTrack = localStream?.getVideoTracks()[0];
        if (cameraTrack) {
            for (const peerId in peers) {
                const sender = peers[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(cameraTrack);
            }
        }
        localVideo.srcObject = localStream;

        isSharing = false;
        btnShare.classList.remove('toolbar__btn-circle--sharing');
        labelShare.textContent = 'Share';
        showToast('Screen sharing stopped');
    }

    // Leave — show confirmation modal
    const leaveModal = document.getElementById('leave-modal');
    const btnLeaveCancel = document.getElementById('btn-leave-cancel');
    const btnLeaveConfirm = document.getElementById('btn-leave-confirm');

    btnLeave.addEventListener('click', () => {
        leaveModal.classList.remove('hidden');
    });

    btnLeaveCancel.addEventListener('click', () => {
        leaveModal.classList.add('hidden');
    });

    btnLeaveConfirm.addEventListener('click', () => {
        leaveModal.classList.add('hidden');
        leaveRoom();
    });

    function leaveRoom() {
        // Close all peer connections
        for (const peerId in peers) {
            closePeer(peerId);
        }
        // Stop local media
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
        }
        socket.disconnect();
        window.location.href = '/';
    }

    // Copy room link
    btnCopy.addEventListener('click', () => {
        const link = `${window.location.origin}/room?id=${roomId}`;
        navigator.clipboard.writeText(link).then(() => {
            showToast('Room link copied!');
        }).catch(() => {
            // Fallback
            const input = document.createElement('input');
            input.value = link;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            showToast('Room link copied!');
        });
    });

    // ── Initialisation ──────────────────────────────
    async function init() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localVideo.srcObject = localStream;
        } catch (err) {
            console.warn('Could not get user media:', err);
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localVideo.srcObject = localStream;
            } catch (err2) {
                console.warn('Could not get any media:', err2);
                localStream = new MediaStream();
            }
        }

        // Default: mute audio and disable video tracks
        localStream.getAudioTracks().forEach(t => (t.enabled = false));
        localStream.getVideoTracks().forEach(t => (t.enabled = false));

        // Set toolbar to off state
        const micIcon = btnMic.querySelector('.material-symbols-outlined');
        micIcon.textContent = 'mic_off';
        btnMic.classList.add('toolbar__btn-circle--off');
        labelMic.textContent = 'Unmute';
        localMicIcon.textContent = 'mic_off';
        localMicIcon.className = 'material-symbols-outlined mic-off';

        const camIcon = btnCamera.querySelector('.material-symbols-outlined');
        camIcon.textContent = 'videocam_off';
        btnCamera.classList.add('toolbar__btn-circle--off');
        labelCamera.textContent = 'Start Video';
        localVideo.style.display = 'none';
        localPlaceholder.style.display = 'flex';

        // Join the room via signaling server
        socket.emit('join-room', { roomId, userName });

        // Hide loading
        loadingOverlay.classList.add('hidden');
    }

    init();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        for (const peerId in peers) {
            if (peers[peerId]) peers[peerId].close();
        }
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    });

})();
