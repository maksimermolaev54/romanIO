const WebSocket = require("ws");
const os = require("os");

const port = Number(process.env.PORT || 8765);
const wss = new WebSocket.Server({ host: "0.0.0.0", port });

const rooms = new Map(); // room -> Map(clientId -> { ws, name, host })
const clients = new Map(); // clientId -> { room, name }

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

function handleJoin(ws, msg, clientId) {
  const roomName = String(msg.room || "party").slice(0, 40) || "party";
  const name = String(msg.name || "Player").slice(0, 24) || "Player";
  const roomMap = getRoom(roomName);
  const isHost = roomMap.size === 0;

  clients.set(clientId, { room: roomName, name });
  roomMap.set(clientId, { ws, name, host: isHost });

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

    if (msg.type === "input" || msg.type === "snapshot") {
      const out = { ...msg, from: clientId };
      broadcast(clientInfo.room, out, clientId);
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
