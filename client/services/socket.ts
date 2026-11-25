import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "../utils/api";

const API = API_BASE_URL;
let socket: Socket | null = null;
let socketToken: string | null = null;

/**
 * Singleton socket. Auth token is sent in the handshake so the server can
 * authorize room joins and attribute messages/tasks to a user.
 *
 * Phase 2: the socket is bound to the token it was created with. A different
 * token (new login, password reset, account switch) replaces the connection,
 * so a previous user's identity and room memberships are never reused.
 */
export function getSocket(token: string | null): Socket {
  if (socket && socketToken !== token) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  if (!socket) {
    socketToken = token;
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
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
