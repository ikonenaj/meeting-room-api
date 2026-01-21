# Prompt 1:

You are a fullstack developer.
Your goal is to implement a simple API for reserving meeting rooms.
Ask clarifications if anything is ambiguous or missing from the assignment.

Requirements:

    Technologies:
        - TypeScript, Node.js, Express, in-memory database (do not use any external in-memory database, for example Redis).
        - Do not create a UI.

    The user should be able to:
        - Reserve a room for a certain time period.
        - Cancel a reservation. Users must be able to cancel only their own reservations (do not build a login system or any other authentication, assume that userID is sent in the request body or headers).
        - View reservations:
            - View all reservations for a certain room
            - View all reservations for all rooms
            - View reservations for a certain time period if a time period is given

    Business rules:
        - Reservations cannot overlap
        - Reservations can't be in the past
        - Reservations start-time must be before the end-time
        - Reservations can be made maximum 1 year into the future
        - Minimum reservation length is 15 minutes
        - Maximum reservation length is 8 hours
        - Each user can have two active reservations (reservations are active either now or in the future, past reservations do not count)

Generate the code for the API. Create also the initial package.json and tsconfig.json files.

# Response 1:

Below is a **complete, minimal but production-style implementation** of the requested API using **TypeScript + Node.js + Express + an in-memory store**.

I’ll first state **assumptions** (to resolve ambiguities), then provide:

1. API design overview
2. Folder structure
3. `package.json`
4. `tsconfig.json`
5. Full source code (`src/index.ts`)
6. Example requests

If any assumption is incorrect, tell me and I’ll adjust.

---

## Assumptions (explicitly stated)

1. **Rooms**

   * Rooms are identified by a `roomId` string.
   * No separate “create room” endpoint; rooms are created implicitly when reserved.

2. **User identification**

   * `userId` is sent via request header: `x-user-id`
   * No authentication or authorization beyond that.

3. **Time format**

   * All times are ISO-8601 strings (e.g. `2026-01-21T10:00:00Z`)
   * All comparisons are done in UTC.

4. **In-memory persistence**

   * Data is lost when the server restarts (as required).

---

## API Overview

### Endpoints

| Method | Path                | Description                           |
| ------ | ------------------- | ------------------------------------- |
| POST   | `/reservations`     | Create a reservation                  |
| DELETE | `/reservations/:id` | Cancel own reservation                |
| GET    | `/reservations`     | View reservations (filters supported) |

### Query Parameters for GET `/reservations`

| Param       | Optional | Description           |
| ----------- | -------- | --------------------- |
| `roomId`    | yes      | Filter by room        |
| `startTime` | yes      | Filter by time window |
| `endTime`   | yes      | Filter by time window |

---

## Project Structure

```
meeting-room-api/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

---

## package.json

```json
{
  "name": "meeting-room-api",
  "version": "1.0.0",
  "description": "Simple in-memory meeting room reservation API",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.19",
    "@types/uuid": "^9.0.7",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.3"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

---

## src/index.ts

```ts
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
```

---

## Example Requests

### Create reservation

```http
POST /reservations
x-user-id: user1
Content-Type: application/json

{
  "roomId": "roomA",
  "startTime": "2026-01-21T10:00:00Z",
  "endTime": "2026-01-21T11:00:00Z"
}
```

### Cancel reservation

```http
DELETE /reservations/RESERVATION_ID
x-user-id: user1
```

### View reservations

```http
GET /reservations?roomId=roomA&startTime=2026-01-21T00:00:00Z&endTime=2026-01-22T00:00:00Z
```

---

## What I can add if you want

* OpenAPI / Swagger spec
* Unit tests (Jest)
* Pagination
* Soft deletes
* Room availability endpoint
* Dockerfile

Just tell me 👍
