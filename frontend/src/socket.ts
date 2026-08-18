// Socket.IO client singleton (web). Path MUST match the backend socketio_path.
import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (Platform.OS !== "web") return null;
  if (!socket) {
    socket = io(BASE, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function joinRoom(roomId: string) {
  const s = getSocket();
  if (!s) return;
  const doJoin = () => s.emit("join_room", { room_id: roomId });
  if (s.connected) doJoin();
  s.on("connect", doJoin); // re-join after reconnects
}

export function leaveRoom(roomId: string) {
  const s = getSocket();
  if (s?.connected) s.emit("leave_room", { room_id: roomId });
}
