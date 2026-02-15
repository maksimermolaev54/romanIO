import asyncio
import json
import os
import uuid
from collections import defaultdict

import websockets


rooms = defaultdict(dict)
clients = {}


async def safe_send(ws, payload):
    try:
        await ws.send(json.dumps(payload))
    except Exception:
        return


async def broadcast(room, payload, skip=None):
    for cid, info in list(rooms[room].items()):
        if skip is not None and cid == skip:
            continue
        await safe_send(info["ws"], payload)


def current_host(room):
    for cid, info in rooms[room].items():
        if info.get("host"):
            return cid
    return None


async def handle_join(ws, msg, cid):
    room = str(msg.get("room", "party"))[:40] or "party"
    name = str(msg.get("name", "Player"))[:24] or "Player"

    clients[cid] = {"room": room, "name": name}
    if not rooms[room]:
        host = True
    else:
        host = False

    rooms[room][cid] = {"ws": ws, "name": name, "host": host}

    await safe_send(ws, {"type": "welcome", "id": cid})
    await safe_send(
        ws,
        {
            "type": "room_state",
            "hostId": current_host(room),
            "peers": [{"id": pid, "name": p["name"]} for pid, p in rooms[room].items()],
        },
    )
    await broadcast(room, {"type": "peer_join", "id": cid, "name": name}, skip=cid)


async def handle_disconnect(cid):
    info = clients.get(cid)
    if not info:
        return
    room = info["room"]
    if cid not in rooms[room]:
        clients.pop(cid, None)
        return

    was_host = rooms[room][cid].get("host", False)
    rooms[room].pop(cid, None)
    clients.pop(cid, None)

    if not rooms[room]:
        rooms.pop(room, None)
        return

    if was_host:
        next_host = next(iter(rooms[room].keys()))
        rooms[room][next_host]["host"] = True
        await broadcast(room, {"type": "host_changed", "hostId": next_host})

    await broadcast(room, {"type": "peer_leave", "id": cid})


async def handler(ws):
    cid = uuid.uuid4().hex[:10]
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")
            if msg_type == "join":
                await handle_join(ws, msg, cid)
                continue

            info = clients.get(cid)
            if not info:
                continue

            room = info["room"]
            if msg_type in {"input", "snapshot"}:
                out = dict(msg)
                out["from"] = cid
                await broadcast(room, out, skip=cid)
    finally:
        await handle_disconnect(cid)


async def main():
    port = int(os.getenv("PORT", "8765"))
    async with websockets.serve(handler, "0.0.0.0", port, max_size=2_000_000):
        print(f"Co-op server started on ws://0.0.0.0:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
