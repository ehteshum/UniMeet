# UniMeet

A lightweight, browser-based video meeting application — similar to Google Meet but with zero authentication. Built with WebRTC for peer-to-peer communication and Socket.io for signaling.

## Features

- **No sign-up required** — just create or join a room
- **Real-time video & audio** via WebRTC (peer-to-peer)
- **Screen sharing** using `getDisplayMedia`
- **Multiple participants** — mesh topology, each peer connects to all others
- **Meeting controls** — mute/unmute mic, toggle camera, share screen, leave

## Project Structure

```
UniMeet/
├── public/               # Frontend (static)
│   ├── index.html        # Homepage
│   ├── room.html         # Meeting room
│   ├── css/
│   │   └── style.css     # Design system
│   └── js/
│       ├── app.js        # Homepage logic
│       └── room.js       # WebRTC + meeting room
├── server/
│   ├── server.js         # Signaling server (Node + Socket.io)
│   └── package.json
└── README.md
```

## Run Locally

```bash
# 1. Install dependencies
cd server
npm install

# 2. Start the server
npm start

# 3. Open in browser
# → http://localhost:3000
```

## Deploy for Free

### Render (recommended)
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Deploy — your app will be live at `your-app.onrender.com`

### Railway
1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set the root directory to `server`
4. Railway auto-detects Node.js and deploys

### Glitch
1. Go to [glitch.com](https://glitch.com) → New Project → Import from GitHub
2. Move files so `server.js` and `package.json` are at root
3. Update the static path in `server.js` accordingly

## Tech Stack

| Layer        | Technology              |
|-------------|-------------------------|
| Frontend    | HTML, CSS, Vanilla JS   |
| Realtime    | WebRTC (peer-to-peer)   |
| Signaling   | Node.js + Socket.io     |
| Icons       | Material Symbols        |
| Fonts       | Inter (Google Fonts)    |
| STUN        | Google STUN servers     |

## Limitations

- **Mesh topology**: Each participant connects to every other participant. Works well for 2–6 people. For larger groups, an SFU (Selective Forwarding Unit) would be needed.
- **No TURN server**: Uses only STUN. If both peers are behind symmetric NATs, connections may fail. For production, consider adding a TURN server.
- **No persistence**: Rooms exist only while participants are connected.
