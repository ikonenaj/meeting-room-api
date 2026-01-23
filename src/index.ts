import express, { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { Reservation } from "./types";
import { db } from "./database";
import * as reservationService from "./services/reservationService";

const app = express();
app.use(express.json());

/* =======================
   Helpers
======================= */

function getUserId(req: Request): string | null {
  const userId = req.header("x-user-id");
  if (!userId) return null;
  return userId;
}

/* =======================
   GET /reservations
======================= */

app.get("/reservations", async (req: Request, res: Response) => {
  try {
    const { roomId, startTime, endTime } = req.query;

    if (roomId && typeof roomId !== 'string') {
      return res.status(400).json({ error: "roomId must be a string" })
    }
    if (startTime && typeof startTime !== 'string') {
      return res.status(400).json({ error: "startTime must be a string" })
    }
    if (endTime && typeof endTime !== 'string') {
      return res.status(400).json({ error: "endTime must be a string" })
    }

    const result = await reservationService.getReservations({
      roomId: roomId as string,
      startTime: startTime as string,
      endTime: endTime as string
    })

    return res.json(result);
  } catch (e: any) {
    if (e.message.includes("Invalid")) {
      return res.status(400).json({ error: e.message })
    }
    return res.status(500).json({ error: "Internal Server Error" })
  }
});

/* =======================
   POST /reservations
======================= */

app.post("/reservations", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Missing x-user-id header" });
  }

  const { roomId, startTime, endTime } = req.body;

  if (!roomId || !startTime || !endTime) {
    return res.status(400).json({ error: "roomId, startTime, endTime are required" });
  }

  if (typeof roomId !== 'string' || typeof startTime !== 'string' || typeof endTime !== 'string') {
    return res.status(400).json({ error: "Invalid payload body format. Values must be strings." });
  }

  try {
    const reservation = await reservationService.addReservation({
      roomId,
      userId,
      startTime,
      endTime
    });

    return res.status(201).json(reservation);

  } catch (e: any) {
    const errorMessage: string = e.message;

    if (e.message === "Room not found") return res.status(404).json({ error: errorMessage });
    if (e.message.includes("User already")) return res.status(403).json({ error: errorMessage });
    if (e.message.includes("Reservation overlaps")) return res.status(409).json({ error: errorMessage });

    return res.status(400).json({ error: errorMessage });
  }
});

/* =======================
   DELETE /reservations/:id
======================= */

app.delete("/reservations/:id", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Missing x-user-id header" });
  }

  const { id } = req.params;
  
  try {
    await reservationService.deleteReservation(id, userId);
    return res.status(204).send();
  } catch (e: any) {
    const errorMessage: string = e.message;
    if (errorMessage === "Reservation not found") return res.status(404).json({ error: errorMessage });
    if (errorMessage === "Cannot cancel another user's reservation") return res.status(403).json({ error: errorMessage });

    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/* =======================
   Server
======================= */

const PORT = 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Meeting room API running on port ${PORT}`);
  });
}

export default app;