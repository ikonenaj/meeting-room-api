import express, { Request, Response } from "express";
import { v4 as uuid } from "uuid";

const app = express();
app.use(express.json());

/* =======================
   Types
======================= */

interface Reservation {
  id: string;
  roomId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
}

/* =======================
   In-memory database
======================= */

const reservations: Reservation[] = [];

/* =======================
   Helpers
======================= */

function getUserId(req: Request): string {
  const userId = req.header("x-user-id");
  if (!userId) {
    throw new Error("Missing x-user-id header");
  }
  return userId;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function getActiveReservationsByUser(userId: string): Reservation[] {
  const now = new Date();
  return reservations.filter(
    r => r.userId === userId && r.endTime > now
  );
}

/* =======================
   POST /reservations
======================= */

app.post("/reservations", (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { roomId, startTime, endTime } = req.body;

    if (!roomId || !startTime || !endTime) {
      return res.status(400).json({ error: "roomId, startTime, endTime are required" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (start >= end) {
      return res.status(400).json({ error: "startTime must be before endTime" });
    }

    if (start < now) {
      return res.status(400).json({ error: "Reservations cannot be in the past" });
    }

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    if (start > oneYearFromNow) {
      return res.status(400).json({ error: "Reservations can be made max 1 year in advance" });
    }

    const durationMinutes = (end.getTime() - start.getTime()) / 60000;

    if (durationMinutes < 15) {
      return res.status(400).json({ error: "Minimum reservation length is 15 minutes" });
    }

    if (durationMinutes > 480) {
      return res.status(400).json({ error: "Maximum reservation length is 8 hours" });
    }

    const activeReservations = getActiveReservationsByUser(userId);
    if (activeReservations.length >= 2) {
      return res.status(400).json({ error: "User already has 2 active reservations" });
    }

    const roomReservations = reservations.filter(r => r.roomId === roomId);

    const conflict = roomReservations.some(r =>
      overlaps(start, end, r.startTime, r.endTime)
    );

    if (conflict) {
      return res.status(400).json({ error: "Reservation overlaps with an existing one" });
    }

    const reservation: Reservation = {
      id: uuid(),
      roomId,
      userId,
      startTime: start,
      endTime: end
    };

    reservations.push(reservation);

    return res.status(201).json(reservation);

  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* =======================
   DELETE /reservations/:id
======================= */

app.delete("/reservations/:id", (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const index = reservations.findIndex(r => r.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservations[index].userId !== userId) {
      return res.status(403).json({ error: "Cannot cancel another user's reservation" });
    }

    reservations.splice(index, 1);
    return res.status(204).send();

  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/* =======================
   GET /reservations
======================= */

app.get("/reservations", (req: Request, res: Response) => {
  let result = [...reservations];

  const { roomId, startTime, endTime } = req.query;

  if (roomId) {
    result = result.filter(r => r.roomId === roomId);
  }

  if (startTime || endTime) {
    const start = startTime ? new Date(startTime as string) : new Date(0);
    const end = endTime ? new Date(endTime as string) : new Date("9999-12-31");

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid time range" });
    }

    result = result.filter(r =>
      overlaps(start, end, r.startTime, r.endTime)
    );
  }

  return res.json(result);
});

/* =======================
   Server
======================= */

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Meeting room API running on port ${PORT}`);
});
