/**
 * UniMeet Signaling Server
 * -------------------------------------------------
 * Lightweight Node.js + Express + Socket.io server.
 * - Serves the static frontend from ../public
 * - Manages WebRTC signaling (offer / answer / ICE)
 * - Tracks rooms and participants in-memory
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ── Serve static frontend ──────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback: serve index.html for any non-file route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/room', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'room.html'));
});

// ── In-memory room store ────────────────────────────
// rooms = { roomId: Set<socketId> }
const rooms = {};

// ── Socket.io signaling ─────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect]  ${socket.id}`);

  /**
   * join-room
   * Payload: { roomId, userName }
   */
  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName || 'Guest';

    if (!rooms[roomId]) rooms[roomId] = new Set();
    rooms[roomId].add(socket.id);

    // Tell existing participants about the newcomer
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userName: socket.data.userName
    });

    // Send the newcomer a list of everyone already in the room
    const existingUsers = [];
    for (const id of rooms[roomId]) {
      if (id !== socket.id) {
        const s = io.sockets.sockets.get(id);
        existingUsers.push({
          userId: id,
          userName: s?.data?.userName || 'Guest'
        });
      }
    }
    socket.emit('existing-users', existingUsers);

    // Broadcast updated participant count
    io.to(roomId).emit('participant-count', rooms[roomId].size);

    console.log(`[join]     ${socket.data.userName} (${socket.id}) → room ${roomId}  (${rooms[roomId].size} users)`);
  });

  /**
   * WebRTC signaling: offer
   */
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', {
      from: socket.id,
      userName: socket.data.userName,
      offer
    });
  });

  /**
   * WebRTC signaling: answer
   */
  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', {
      from: socket.id,
      answer
    });
  });

  /**
   * WebRTC signaling: ICE candidate
   */
  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', {
      from: socket.id,
      candidate
    });
  });

  /**
   * Disconnect / leave
   */
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].delete(socket.id);

      socket.to(roomId).emit('user-left', { userId: socket.id });
      io.to(roomId).emit('participant-count', rooms[roomId].size);

      if (rooms[roomId].size === 0) delete rooms[roomId];

      console.log(`[leave]    ${socket.data.userName} (${socket.id}) ← room ${roomId}`);
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ── Start ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ✦ UniMeet server running at http://localhost:${PORT}\n`);
});
