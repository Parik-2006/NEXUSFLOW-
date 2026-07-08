import { io, Socket } from "socket.io-client";

const API = process.env.EXPO_PUBLIC_API_URL ?? "https://nexusflow-nxeg.onrender.com";
let socket: Socket | null = null;

/**
 * Singleton socket. Auth token is sent in the handshake so the server can
 * authorize room joins and attribute messages/tasks to a user.
 */
export function getSocket(token: string | null): Socket {
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io(API, {
      transports: ["websocket"],
      auth: { token },
      autoConnect: true,
      reconnection: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
