import { v4 as uuid } from "uuid";
import { Reservation } from "../types";
import { db } from "../database";

async function getReservations(params: { roomId?: string; startTime?: string; endTime?: string }) {
  let start: Date | undefined;
  let end: Date | undefined;

  if (params.startTime) {
    start = new Date(params.startTime as string);
    if (isNaN(start.getTime())) throw new Error("Invalid startTime format")
  }
  if (params.endTime) {
    end = new Date(params.endTime as string);
    if (isNaN(end.getTime())) throw new Error("Invalid endTime format")
  }

  return db.getReservations({
    roomId: params.roomId,
    start,
    end
  });
}

async function addReservation(params: { roomId: string; userId: string; startTime: string; endTime: string  }) {
  const { userId, roomId, startTime, endTime } = params;

  const start = new Date(startTime);
  const end = new Date(endTime);
  const now = new Date();

  if (!db.getRoom(roomId)) {
    throw new Error("Room not found");
  }

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date format");
  }

  if (start >= end) {
    throw new Error("startTime must be before endTime");
  }

  if (start < now) {
    throw new Error("Reservations cannot be in the past");
  }

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  if (start > oneYearFromNow) {
    throw new Error("Reservations can be made max 1 year in advance");
  }

  const durationMinutes = (end.getTime() - start.getTime()) / 60000;

  if (durationMinutes < 15) {
    throw new Error("Minimum reservation length is 15 minutes");
  }

  if (durationMinutes > 480) {
    throw new Error("Maximum reservation length is 8 hours");
  }

  const activeReservations = db.getActiveReservationsByUser(userId);
  if (activeReservations.length >= 2) {
    throw new Error("User already has 2 active reservations");
  }

  if (!db.isRoomAvailable(roomId, start, end)) {
    throw new Error("Reservation overlaps with an existing one");
  }

  const reservation: Reservation = {
    id: uuid(),
    roomId,
    userId,
    startTime: start,
    endTime: end,
    createdAt: now
  }
  db.addReservation(reservation);
  return reservation;
}

export { addReservation, getReservations };