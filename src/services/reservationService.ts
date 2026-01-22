import { v4 as uuid } from "uuid";
import { Reservation } from "../types";
import { db } from "../database";

async function getReservations(params: { roomId?: string, startTime?: string, endTime?: string }) {
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

export { getReservations };