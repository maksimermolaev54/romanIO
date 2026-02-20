const WebSocket = require("ws");
const os = require("os");

const port = Number(process.env.PORT || 8765);
const wss = new WebSocket.Server({ host: "0.0.0.0", port });
const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 4200;

const rooms = new Map(); // room -> Map(clientId -> { ws, name, host })
const clients = new Map(); // clientId -> { room, name }
const roomSchedulers = new Map(); // room -> interval id
const roomRuntime = new Map(); // room -> { players: [{x,y}] }

function makeId() {
  return Math.random().toString(36).slice(2, 12);
}

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function getRoom(roomName) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Map());
  }
  return rooms.get(roomName);
}

function randomPoint() {
  return {
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT
  };
}

function randomPointNear(point, maxDistance = 900) {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * maxDistance;
  return {
    x: Math.max(0, Math.min(WORLD_WIDTH, point.x + Math.cos(angle) * dist)),
    y: Math.max(0, Math.min(WORLD_HEIGHT, point.y + Math.sin(angle) * dist))
  };
}

function currentHost(roomMap) {
  for (const [id, info] of roomMap.entries()) {
    if (info.host) return id;
  }
  return null;
}

function broadcast(roomName, payload, skipId = null) {
  const roomMap = rooms.get(roomName);
  if (!roomMap) return;
  for (const [id, info] of roomMap.entries()) {
    if (skipId && id === skipId) continue;
    safeSend(info.ws, payload);
  }
}

function ensureRoomScheduler(roomName) {
  if (roomSchedulers.has(roomName)) return;
  const timer = setInterval(() => {
    const roomMap = rooms.get(roomName);
    if (!roomMap || roomMap.size === 0) return;

    const hostId = currentHost(roomMap);
    if (!hostId) return;
    const hostInfo = roomMap.get(hostId);
    if (!hostInfo) return;

    const playerCount = roomMap.size;
    const spawnCount = Math.min(8, Math.max(3, Math.round((playerCount + 1) * 1.5)));
    const runtime = roomRuntime.get(roomName);
    const playerPoints = runtime?.players || [];
    const pellets = [];
    for (let i = 0; i < spawnCount; i++) {
      const useNear = playerPoints.length > 0 && Math.random() < 0.75;
      let p = randomPoint();
      if (useNear) {
        const ref = playerPoints[Math.floor(Math.random() * playerPoints.length)];
        p = randomPointNear(ref, 1000);
      }
      pellets.push({
        x: p.x,
        y: p.y,
        bonus: Math.random() < 0.08
      });
    }

    safeSend(hostInfo.ws, { type: "spawn_pellets", pellets });
  }, 140);
  roomSchedulers.set(roomName, timer);
}

function handleJoin(ws, msg, clientId) {
  const roomName = String(msg.room || "party").slice(0, 40) || "party";
  const name = String(msg.name || "Player").slice(0, 24) || "Player";
  const roomMap = getRoom(roomName);
  const isHost = roomMap.size === 0;

  clients.set(clientId, { room: roomName, name });
  roomMap.set(clientId, { ws, name, host: isHost });
  if (!roomRuntime.has(roomName)) {
    roomRuntime.set(roomName, { players: [] });
  }
  ensureRoomScheduler(roomName);

  safeSend(ws, { type: "welcome", id: clientId });
  safeSend(ws, {
    type: "room_state",
    hostId: currentHost(roomMap),
    peers: [...roomMap.entries()].map(([id, p]) => ({ id, name: p.name }))
  });

  broadcast(roomName, { type: "peer_join", id: clientId, name }, clientId);
}

function handleDisconnect(clientId) {
  const info = clients.get(clientId);
  if (!info) return;
  clients.delete(clientId);

  const roomMap = rooms.get(info.room);
  if (!roomMap) return;

  const wasHost = roomMap.get(clientId)?.host === true;
  roomMap.delete(clientId);

  if (roomMap.size === 0) {
    rooms.delete(info.room);
    roomRuntime.delete(info.room);
    if (roomSchedulers.has(info.room)) {
      clearInterval(roomSchedulers.get(info.room));
      roomSchedulers.delete(info.room);
    }
    return;
  }

  if (wasHost) {
    const nextHostId = roomMap.keys().next().value;
    const nextHost = roomMap.get(nextHostId);
    if (nextHost) nextHost.host = true;
    broadcast(info.room, { type: "host_changed", hostId: nextHostId });
  }

  broadcast(info.room, { type: "peer_leave", id: clientId });
}

wss.on("connection", (ws) => {
  const clientId = makeId();

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join") {
      handleJoin(ws, msg, clientId);
      return;
    }

    const clientInfo = clients.get(clientId);
    if (!clientInfo) return;

    if (msg.type === "snapshot") {
      const roomMap = rooms.get(clientInfo.room);
      const hostId = roomMap ? currentHost(roomMap) : null;
      if (hostId === clientId) {
        const playersObj = msg.players && typeof msg.players === "object" ? msg.players : {};
        const players = [];
        for (const p of Object.values(playersObj)) {
          const x = Number(p.x);
          const y = Number(p.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            players.push({ x, y });
          }
        }
        roomRuntime.set(clientInfo.room, { players });
      }
      const out = { ...msg, from: clientId };
      broadcast(clientInfo.room, out, clientId);
      return;
    }

    if (msg.type === "input") {
      const out = { ...msg, from: clientId };
      broadcast(clientInfo.room, out, clientId);
      return;
    }

    if (msg.type === "eject_mass") {
      const out = { ...msg, from: clientId };
      // Send to all including host so only host applies authoritative eject.
      broadcast(clientInfo.room, out, null);
    }
  });

  ws.on("close", () => {
    handleDisconnect(clientId);
  });

  ws.on("error", () => {
    handleDisconnect(clientId);
  });
});

function getLocalIPv4() {
  const result = [];
  const nets = os.networkInterfaces();
  for (const values of Object.values(nets)) {
    if (!values) continue;
    for (const info of values) {
      if (info.family !== "IPv4" || info.internal) continue;
      result.push(info.address);
    }
  }
  return [...new Set(result)];
}

console.log(`Co-op Node server started on ws://0.0.0.0:${port}`);
console.log(`Local: ws://localhost:${port}`);
for (const ip of getLocalIPv4()) {
  console.log(`LAN:   ws://${ip}:${port}`);
}
