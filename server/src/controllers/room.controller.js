import { env } from '../config/env.js';
import * as rooms from '../services/room.service.js';
import { broadcast } from '../sockets/io.js';

export async function create(req, res) {
  const { id, expiresAt } = await rooms.createRoom(req.user.id);
  res.status(201).json({
    roomId: id,
    joinUrl: rooms.joinUrl(id, env.clientOrigin),
    expiresAt,
  });
}

export async function get(req, res) {
  const state = await rooms.getRoomState(req.params.id);
  res.json(state);
}

export async function join(req, res) {
  const state = await rooms.joinRoom(req.params.id, req.user.id);
  // Tell anyone already watching the room that membership changed.
  broadcast(state.id, 'room:state', state);
  res.json(state);
}

export async function leave(req, res) {
  const result = await rooms.leaveRoom(req.params.id, req.user.id);
  if (result.deleted) {
    broadcast(result.roomId, 'room:closed', { roomId: result.roomId });
  } else {
    broadcast(result.roomId, 'room:state', await rooms.getRoomState(result.roomId));
  }
  res.json(result);
}
