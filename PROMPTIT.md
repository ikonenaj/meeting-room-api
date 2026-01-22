[Prompt 1 - Ensimmäinen toimiva versio](#prompt-1)
[Prompt 2 - Yksikkötestien luominen](#prompt-2)
[Prompt 3 - Yksikkötestit post-requestin payload bodylle](#prompt-3)
[Prompt 4 - Mock database testejä varten](#prompt-4)
[Prompt 5 - Luo dockerfile](#prompt-5)


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


# Prompt 2

<index.ts, database.ts ja types.ts tiedostojen päivitetty sisältö>

Do not edit any of the source code files. Create extensive unit tests for searching for reservations, adding new reservations, and deleting reservations, that cover both correct and incorrect use cases. Create also unit tests for edge cases, for example a new reservation begins at the same time as the previous ends.

# Response 2

Here are the extensive unit tests written in TypeScript using jest and supertest.

These tests cover the three main pillars you requested:

    Searching (GET): Filtering by room, time ranges, and handling empty results.

    Creation (POST): Validation (missing fields, dates), business rules (max duration, max active reservations), and strict time overlap checks.

    Deletion (DELETE): Ownership verification and non-existent resource handling.

Test File: tests/api.test.ts
```TypeScript

import request from "supertest";
import { v4 as uuid } from "uuid";
// Assuming your express app is exported from index.ts. 
// If index.ts starts the server on import, ensure your test environment handles the open port or modify index.ts to export `app`.
import app from "../index"; 

describe("Meeting Room API Integration Tests", () => {
  // Helper to generate a unique user ID to prevent state pollution between tests
  const generateUserId = () => `user-${uuid()}`;
  
  // Helper to get a future date to avoid "past date" errors
  const getFutureDate = (hoursToAdd: number): Date => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + 1); // Add buffer so it's strictly > now
    date.setHours(date.getHours() + hoursToAdd);
    return date;
  };

  const roomId = "room1"; // Use a valid room ID from the mock database

  describe("POST /reservations (Adding Reservations)", () => {
    let userId: string;

    beforeEach(() => {
      userId = generateUserId();
    });

    it("should successfully create a reservation with valid data", async () => {
      const startTime = getFutureDate(1);
      const endTime = getFutureDate(2); // 1 hour duration

      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.roomId).toBe(roomId);
      expect(res.body.userId).toBe(userId);
    });

    it("should fail if header x-user-id is missing", async () => {
      const res = await request(app)
        .post("/reservations")
        .send({
          roomId,
          startTime: getFutureDate(1),
          endTime: getFutureDate(2)
        });

      expect(res.status).toBe(400); // The helper throws Error, caught by catch block
      expect(res.body.error).toBe("Missing x-user-id header");
    });

    it("should fail if required fields are missing", async () => {
      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({ roomId }); // Missing times

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("roomId, startTime, endTime are required");
    });

    it("should fail if start time is after end time", async () => {
      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: getFutureDate(3),
          endTime: getFutureDate(2) // End is before start
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("startTime must be before endTime");
    });

    it("should fail if duration is less than 15 minutes", async () => {
      const start = getFutureDate(1);
      const end = new Date(start.getTime() + 10 * 60000); // 10 mins later

      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: start.toISOString(),
          endTime: end.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Minimum reservation length is 15 minutes");
    });

    it("should fail if duration is longer than 8 hours", async () => {
      const start = getFutureDate(1);
      const end = new Date(start.getTime() + 9 * 60 * 60000); // 9 hours later

      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: start.toISOString(),
          endTime: end.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Maximum reservation length is 8 hours");
    });

    it("should fail if user tries to make a 3rd active reservation", async () => {
      // Create 1st
      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId, startTime: getFutureDate(1), endTime: getFutureDate(2)
      });
      // Create 2nd
      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId, startTime: getFutureDate(3), endTime: getFutureDate(4)
      });

      // Try 3rd
      const res = await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId, startTime: getFutureDate(5), endTime: getFutureDate(6)
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("User already has 2 active reservations");
    });
  });

  describe("Overlap Logic & Edge Cases", () => {
    let baseStart: Date;
    let baseEnd: Date;
    const userId = generateUserId();

    beforeAll(async () => {
      // Create a base reservation to test overlaps against
      // Starts in 24 hours, lasts 1 hour
      baseStart = getFutureDate(24);
      baseEnd = new Date(baseStart.getTime() + 60 * 60000);

      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId,
        startTime: baseStart.toISOString(),
        endTime: baseEnd.toISOString()
      });
    });

    it("should fail if new reservation overlaps exact time", async () => {
      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: baseStart.toISOString(),
        endTime: baseEnd.toISOString()
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Reservation overlaps with an existing one");
    });

    it("should fail if new reservation is inside an existing one", async () => {
      const innerStart = new Date(baseStart.getTime() + 15 * 60000);
      const innerEnd = new Date(baseEnd.getTime() - 15 * 60000);

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: innerStart.toISOString(),
        endTime: innerEnd.toISOString()
      });
      expect(res.status).toBe(400);
    });

    it("should fail if new reservation envelops an existing one", async () => {
      const outerStart = new Date(baseStart.getTime() - 15 * 60000);
      const outerEnd = new Date(baseEnd.getTime() + 15 * 60000);

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: outerStart.toISOString(),
        endTime: outerEnd.toISOString()
      });
      expect(res.status).toBe(400);
    });

    it("should fail if new reservation overlaps the start", async () => {
      const overlapStart = new Date(baseStart.getTime() - 30 * 60000);
      const overlapEnd = new Date(baseStart.getTime() + 15 * 60000); // 15 mins into existing

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: overlapStart.toISOString(),
        endTime: overlapEnd.toISOString()
      });
      expect(res.status).toBe(400);
    });

    it("should SUCCEED if new reservation ends exactly when existing starts (Adjacency)", async () => {
      const beforeStart = new Date(baseStart.getTime() - 60 * 60000);
      const beforeEnd = baseStart; // Ends exactly at start

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: beforeStart.toISOString(),
        endTime: beforeEnd.toISOString()
      });
      expect(res.status).toBe(201);
    });

    it("should SUCCEED if new reservation starts exactly when existing ends (Adjacency)", async () => {
      const afterStart = baseEnd; // Starts exactly at end
      const afterEnd = new Date(baseEnd.getTime() + 60 * 60000);

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: afterStart.toISOString(),
        endTime: afterEnd.toISOString()
      });
      expect(res.status).toBe(201);
    });
  });

  describe("GET /reservations (Searching)", () => {
    const userId = generateUserId();
    let searchStart: Date;

    beforeAll(async () => {
      // Setup: Create a unique reservation for search
      searchStart = getFutureDate(48); // 48 hours from now
      const searchEnd = new Date(searchStart.getTime() + 60 * 60000);

      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId,
        startTime: searchStart.toISOString(),
        endTime: searchEnd.toISOString()
      });
    });

    it("should retrieve all reservations if no filter is applied", async () => {
      const res = await request(app).get("/reservations");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("should filter by roomId", async () => {
      const res = await request(app).get(`/reservations?roomId=${roomId}`);
      expect(res.status).toBe(200);
      // Ensure all returned items match the room ID
      const allMatch = res.body.every((r: any) => r.roomId === roomId);
      expect(allMatch).toBe(true);
    });

    it("should filter by time range (finding the reservation)", async () => {
      // Query covers the exact time
      const queryStart = new Date(searchStart.getTime() - 1000).toISOString();
      const queryEnd = new Date(searchStart.getTime() + 65 * 60000).toISOString();

      const res = await request(app)
        .get("/reservations")
        .query({ startTime: queryStart, endTime: queryEnd });

      expect(res.status).toBe(200);
      const found = res.body.find((r: any) => r.userId === userId);
      expect(found).toBeDefined();
    });

    it("should filter by time range (excluding the reservation)", async () => {
      // Query is way in the past relative to the reservation
      const queryStart = getFutureDate(1).toISOString();
      const queryEnd = getFutureDate(2).toISOString();

      const res = await request(app)
        .get("/reservations")
        .query({ startTime: queryStart, endTime: queryEnd });

      expect(res.status).toBe(200);
      // Our specific reservation (starts in 48h) should not be here
      const found = res.body.find((r: any) => r.userId === userId);
      expect(found).toBeUndefined();
    });

    it("should return 400 for invalid date format", async () => {
      const res = await request(app)
        .get("/reservations")
        .query({ startTime: "invalid-date" });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid time range");
    });
  });

  describe("DELETE /reservations/:id (Deletion)", () => {
    let userId: string;
    let reservationId: string;

    beforeEach(async () => {
      userId = generateUserId();
      // Create a reservation to delete
      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: getFutureDate(1),
          endTime: getFutureDate(2)
        });
      reservationId = res.body.id;
    });

    it("should delete a reservation successfully", async () => {
      const res = await request(app)
        .delete(`/reservations/${reservationId}`)
        .set("x-user-id", userId);

      expect(res.status).toBe(204);

      // Verify it is gone
      const check = await request(app).get("/reservations");
      const found = check.body.find((r: any) => r.id === reservationId);
      expect(found).toBeUndefined();
    });

    it("should return 404 if reservation does not exist", async () => {
      const res = await request(app)
        .delete(`/reservations/fake-uuid-1234`)
        .set("x-user-id", userId);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Reservation not found");
    });

    it("should return 403 if user tries to delete someone else's reservation", async () => {
      const maliciousUser = generateUserId();
      
      const res = await request(app)
        .delete(`/reservations/${reservationId}`)
        .set("x-user-id", maliciousUser);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Cannot cancel another user's reservation");
      
      // Verify it was NOT deleted
      const check = await request(app).get("/reservations");
      const found = check.body.find((r: any) => r.id === reservationId);
      expect(found).toBeDefined();
    });
  });
});
```

# Prompt 3

Add unit tests for testing payload body format in post requests 

# Response 3

Based on your request, here are the specific unit tests to verify the payload body format validation logic.

These tests specifically target the line in your API code that checks: if (typeof roomId !== 'string' || typeof startTime !== 'string' || typeof endTime !== 'string')

You can add this block inside your existing describe("POST /reservations ...") section.
New Test Block: Payload Format Validation
```TypeScript

    describe("Payload Format Validation", () => {
      it("should fail if roomId is not a string", async () => {
        const res = await request(app)
          .post("/reservations")
          .set("x-user-id", userId)
          .send({
            roomId: 101, // sending a number instead of string
            startTime: getFutureDate(1).toISOString(),
            endTime: getFutureDate(2).toISOString()
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid payload body format. Values must be strings.");
      });

      it("should fail if startTime is not a string (e.g. number timestamp)", async () => {
        const res = await request(app)
          .post("/reservations")
          .set("x-user-id", userId)
          .send({
            roomId: roomId,
            startTime: Date.now(), // sending number instead of ISO string
            endTime: getFutureDate(2).toISOString()
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid payload body format. Values must be strings.");
      });

      it("should fail if endTime is not a string (e.g. null)", async () => {
        const res = await request(app)
          .post("/reservations")
          .set("x-user-id", userId)
          .send({
            roomId: roomId,
            startTime: getFutureDate(1).toISOString(),
            endTime: null // sending null
          });

        // Note: Depending on your middleware, null might not trigger 'typeof !== string' 
        // if strict checks are loose, but usually 'object' !== 'string'.
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid payload body format. Values must be strings.");
      });

      it("should fail if payload is a boolean", async () => {
         const res = await request(app)
          .post("/reservations")
          .set("x-user-id", userId)
          .send({
            roomId: true, // boolean
            startTime: getFutureDate(1).toISOString(),
            endTime: getFutureDate(2).toISOString()
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid payload body format. Values must be strings.");
      });
    });
```

Where to insert this

Place this new describe block inside your existing describe("POST /reservations (Adding Reservations)", ...) block, preferably right after the it("should fail if required fields are missing", ...) test.
Why these tests matter

  1.  Type Safety: Express parses JSON bodies into standard JS types. If a client sends roomId: 123, it enters your code as a number. Without your specific check (typeof !== 'string'), the code might crash later when trying to do string operations or database lookups expecting a string.

  2.  API Contract: It enforces the contract that dates must be passed as ISO strings, not Unix timestamps (numbers).


# Prompt 4

<database.ts ja api.test.ts tiedostojen sisältö>

 Refactor the test file to use mock database with Jest. Do not add, remove or change the functionality of any tests.

# Response 4

Here is the refactored api.test.ts file.

It uses jest.mock to replace the real database implementation with a functional mock. This mock replicates the stateful behavior and logic (such as overlap detection) required for the integration tests to pass without modifying the tests themselves.

api.test.ts
```TypeScript

import request from "supertest";
import { v4 as uuid } from "uuid";

// --- MOCK DATABASE SETUP ---
// We mock the database module before importing the app so the app uses the mock.
jest.mock("../src/database", () => {
  // Internal state for the mock database
  let mockReservations: any[] = [];

  const Rooms = [
    { id: "room1", name: "Room 1" },
    { id: "room2", name: "Room 2" },
    { id: "room3", name: "Room 3" }
  ];

  // Helper logic duplicated from original database.ts to ensure mock behaves correctly
  function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && bStart < aEnd;
  }

  return {
    Rooms,
    db: {
      getRoom: jest.fn((id: string) => Rooms.find(r => r.id === id)),

      getReservation: jest.fn((id: string) => mockReservations.find(r => r.id === id)),

      getReservations: jest.fn((filter: { roomId?: string; start?: Date; end?: Date }) => {
        return mockReservations.filter(r => {
          let match = true;
          if (filter.roomId) match = match && r.roomId === filter.roomId;

          if (filter.start || filter.end) {
            const start = filter.start ? filter.start : new Date(0);
            const end = filter.end ? filter.end : new Date("9999-12-31");
            match = match && overlaps(start, end, r.startTime, r.endTime);
          }
          return match;
        });
      }),

      getActiveReservationsByUser: jest.fn((userId: string) => {
        const now = new Date();
        return mockReservations.filter(
          r => r.userId === userId && r.endTime > now
        );
      }),

      addReservation: jest.fn((reservation: any) => {
        mockReservations.push(reservation);
      }),

      deleteReservation: jest.fn((id: string) => {
        mockReservations = mockReservations.filter(r => r.id !== id);
      }),

      isRoomAvailable: jest.fn((roomId: string, start: Date, end: Date) => {
        const reservations = mockReservations.filter(r => r.roomId === roomId);
        const conflict = reservations.some(r => overlaps(start, end, r.startTime, r.endTime));
        return !conflict;
      })
    }
  };
});

// --- IMPORTS ---
// Assuming your express app is exported from index.ts.
import app from "../src/index";
import { db } from "../src/database";

// --- TESTS ---
describe("Meeting Room API Integration Tests", () => {
  // Helper to generate a unique user ID to prevent state pollution between tests
  const generateUserId = () => `user-${uuid()}`;
  
  // Helper to get a future date to avoid "past date" errors
  const getFutureDate = (hoursToAdd: number): Date => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + 1); // Add buffer so it's strictly > now
    date.setHours(date.getHours() + hoursToAdd);
    return date;
  };

  const roomId = "room1"; // Use a valid room ID from the mock database

  describe("POST /reservations (Adding Reservations)", () => {
    let userId: string;

    beforeEach(() => {
      // Clean up the mock state
      const allReservations = db.getReservations({});
      allReservations.forEach(r => db.deleteReservation(r.id));

      userId = generateUserId();
    });

    it("should successfully create a reservation with valid data", async () => {
      const startTime = getFutureDate(1);
      const endTime = getFutureDate(2); // 1 hour duration

      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.roomId).toBe(roomId);
      expect(res.body.userId).toBe(userId);
    });

    it("should fail if header x-user-id is missing", async () => {
      const res = await request(app)
        .post("/reservations")
        .send({
          roomId,
          startTime: getFutureDate(1),
          endTime: getFutureDate(2)
        });

      expect(res.status).toBe(401); 
      expect(res.body.error).toBe("Missing x-user-id header");
    });

    it("should fail if required fields are missing", async () => {
      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({ roomId }); // Missing times

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("roomId, startTime, endTime are required");
    });

    describe("Payload Format Validation", () => {
      it("should fail if roomId is not a string", async () => {
        const res = await request(app)
          .post("/reservations")
          .set("x-user-id", userId)
          .send({
            roomId: 101, // sending a number instead of string
            startTime: getFutureDate(1).toISOString(),
            endTime: getFutureDate(2).toISOString()
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid payload body format. Values must be strings.");
      });

      it("should fail if startTime is not a string (e.g. number timestamp)", async () => {
        const res = await request(app)
          .post("/reservations")
          .set("x-user-id", userId)
          .send({
            roomId: roomId,
            startTime: Date.now(), // sending number instead of ISO string
            endTime: getFutureDate(2).toISOString()
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid payload body format. Values must be strings.");
      });

      it("should fail if payload is a boolean", async () => {
         const res = await request(app)
          .post("/reservations")
          .set("x-user-id", userId)
          .send({
            roomId: true, // boolean
            startTime: getFutureDate(1).toISOString(),
            endTime: getFutureDate(2).toISOString()
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid payload body format. Values must be strings.");
      });
    });

    it("should fail if start time is after end time", async () => {
      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: getFutureDate(3),
          endTime: getFutureDate(2) // End is before start
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("startTime must be before endTime");
    });

    it("should fail if duration is less than 15 minutes", async () => {
      const start = getFutureDate(1);
      const end = new Date(start.getTime() + 10 * 60000); // 10 mins later

      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: start.toISOString(),
          endTime: end.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Minimum reservation length is 15 minutes");
    });

    it("should fail if duration is longer than 8 hours", async () => {
      const start = getFutureDate(1);
      const end = new Date(start.getTime() + 9 * 60 * 60000); // 9 hours later

      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: start.toISOString(),
          endTime: end.toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Maximum reservation length is 8 hours");
    });

    it("should fail if user tries to make a 3rd active reservation", async () => {
      // Create 1st
      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId, startTime: getFutureDate(1), endTime: getFutureDate(2)
      });
      // Create 2nd
      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId, startTime: getFutureDate(3), endTime: getFutureDate(4)
      });

      // Try 3rd
      const res = await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId, startTime: getFutureDate(5), endTime: getFutureDate(6)
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("User already has 2 active reservations");
    });
  });

  describe("Overlap Logic & Edge Cases", () => {
    let baseStart: Date;
    let baseEnd: Date;
    const userId = generateUserId();

    beforeAll(async () => {
      // Clean mock state
      const allReservations = db.getReservations({});
      allReservations.forEach(r => db.deleteReservation(r.id));

      // Create a base reservation to test overlaps against
      // Starts in 24 hours, lasts 1 hour
      baseStart = getFutureDate(24);
      baseEnd = new Date(baseStart.getTime() + 60 * 60000);


      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId,
        startTime: baseStart.toISOString(),
        endTime: baseEnd.toISOString()
      });
    });

    it("should fail if new reservation overlaps exact time", async () => {
      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: baseStart.toISOString(),
        endTime: baseEnd.toISOString()
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Reservation overlaps with an existing one");
    });

    it("should fail if new reservation is inside an existing one", async () => {
      const innerStart = new Date(baseStart.getTime() + 15 * 60000);
      const innerEnd = new Date(baseEnd.getTime() - 15 * 60000);

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: innerStart.toISOString(),
        endTime: innerEnd.toISOString()
      });
      expect(res.status).toBe(409);
    });

    it("should fail if new reservation envelops an existing one", async () => {
      const outerStart = new Date(baseStart.getTime() - 15 * 60000);
      const outerEnd = new Date(baseEnd.getTime() + 15 * 60000);

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: outerStart.toISOString(),
        endTime: outerEnd.toISOString()
      });
      expect(res.status).toBe(409);
    });

    it("should fail if new reservation overlaps the start", async () => {
      const overlapStart = new Date(baseStart.getTime() - 30 * 60000);
      const overlapEnd = new Date(baseStart.getTime() + 15 * 60000); // 15 mins into existing

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: overlapStart.toISOString(),
        endTime: overlapEnd.toISOString()
      });
      expect(res.status).toBe(409);
    });

    it("should SUCCEED if new reservation ends exactly when existing starts (Adjacency)", async () => {
      const beforeStart = new Date(baseStart.getTime() - 60 * 60000);
      const beforeEnd = baseStart; // Ends exactly at start

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: beforeStart.toISOString(),
        endTime: beforeEnd.toISOString()
      });
      expect(res.status).toBe(201);
    });

    it("should SUCCEED if new reservation starts exactly when existing ends (Adjacency)", async () => {
      const afterStart = baseEnd; // Starts exactly at end
      const afterEnd = new Date(baseEnd.getTime() + 60 * 60000);

      const res = await request(app).post("/reservations").set("x-user-id", generateUserId()).send({
        roomId,
        startTime: afterStart.toISOString(),
        endTime: afterEnd.toISOString()
      });
      expect(res.status).toBe(201);
    });
  });

  describe("GET /reservations (Searching)", () => {
    const userId = generateUserId();
    let searchStart: Date;

    beforeAll(async () => {
      // Clean mock state
      const allReservations = db.getReservations({});
      allReservations.forEach(r => db.deleteReservation(r.id));

      // Setup: Create a unique reservation for search
      searchStart = getFutureDate(48); // 48 hours from now
      const searchEnd = new Date(searchStart.getTime() + 60 * 60000);

      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId,
        startTime: searchStart.toISOString(),
        endTime: searchEnd.toISOString()
      });
    });

    it("should retrieve all reservations if no filter is applied", async () => {
      const res = await request(app).get("/reservations");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("should filter by roomId", async () => {
      const res = await request(app).get(`/reservations?roomId=${roomId}`);
      expect(res.status).toBe(200);
      // Ensure all returned items match the room ID
      const allMatch = res.body.every((r: any) => r.roomId === roomId);
      expect(allMatch).toBe(true);
    });

    it("should filter by time range (finding the reservation)", async () => {
      // Query covers the exact time
      const queryStart = new Date(searchStart.getTime() - 1000).toISOString();
      const queryEnd = new Date(searchStart.getTime() + 65 * 60000).toISOString();

      const res = await request(app)
        .get("/reservations")
        .query({ startTime: queryStart, endTime: queryEnd });

      expect(res.status).toBe(200);
      const found = res.body.find((r: any) => r.userId === userId);
      expect(found).toBeDefined();
    });

    it("should filter by time range (excluding the reservation)", async () => {
      // Query is way in the past relative to the reservation
      const queryStart = getFutureDate(1).toISOString();
      const queryEnd = getFutureDate(2).toISOString();

      const res = await request(app)
        .get("/reservations")
        .query({ startTime: queryStart, endTime: queryEnd });

      expect(res.status).toBe(200);
      // Our specific reservation (starts in 48h) should not be here
      const found = res.body.find((r: any) => r.userId === userId);
      expect(found).toBeUndefined();
    });

    it("should return 400 for invalid date format", async () => {
      const res = await request(app)
        .get("/reservations")
        .query({ startTime: "invalid-date" });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid time range");
    });
  });

  describe("DELETE /reservations/:id (Deletion)", () => {
    let userId: string;
    let reservationId: string;

    beforeEach(async () => {
      // Clean mock state
      const allReservations = db.getReservations({});
      allReservations.forEach(r => db.deleteReservation(r.id));

      userId = generateUserId();
      // Create a reservation to delete
      const res = await request(app)
        .post("/reservations")
        .set("x-user-id", userId)
        .send({
          roomId,
          startTime: getFutureDate(1),
          endTime: getFutureDate(2)
        });
      reservationId = res.body.id;
    });

    it("should delete a reservation successfully", async () => {
      const res = await request(app)
        .delete(`/reservations/${reservationId}`)
        .set("x-user-id", userId);

      expect(res.status).toBe(204);

      // Verify it is gone
      const check = await request(app).get("/reservations");
      const found = check.body.find((r: any) => r.id === reservationId);
      expect(found).toBeUndefined();
    });

    it("should return 404 if reservation does not exist", async () => {
      const res = await request(app)
        .delete(`/reservations/fake-uuid-1234`)
        .set("x-user-id", userId);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Reservation not found");
    });

    it("should return 403 if user tries to delete someone else's reservation", async () => {
      const maliciousUser = generateUserId();
      
      const res = await request(app)
        .delete(`/reservations/${reservationId}`)
        .set("x-user-id", maliciousUser);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Cannot cancel another user's reservation");
      
      // Verify it was NOT deleted
      const check = await request(app).get("/reservations");
      const found = check.body.find((r: any) => r.id === reservationId);
      expect(found).toBeDefined();
    });
  });
});
```

# Prompt 5

. 
├── api-calls.rest 
├── node_modules
├── dist 
│ └── index.js
├── jest.config.js
├── package.json
├── package-lock.json
├── PROMPTIT.md
├── src
│ ├── database.ts
│ ├── index.ts
│ └── types.ts
├── tests
│ └── api.test.ts
└── tsconfig.json 

Create a dockerfile and .dockerignore for the project

# Response 5

Nice, pretty standard Node + TypeScript layout 👍
I’ll assume:

You build TypeScript into dist/

dist/index.js is the runtime entry point

You don’t want node_modules baked in from your local machine

This is not using a framework that needs dev deps at runtime

Below is a clean, production-ready setup.

```Dockerfile
# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build


# ---- Runtime stage ----
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/dist ./dist

# If you have runtime files (like migrations, prompts, etc.)
COPY PROMPTIT.md ./

# Expose port if your app listens on one (adjust if needed)
# EXPOSE 3000

CMD ["node", "dist/index.js"]
```

Why this setup?

Multi-stage build → smaller, cleaner image

No TypeScript or dev deps in final image

Reproducible installs via npm ci

```.dockerignore
node_modules
dist
tests
*.log

.git
.gitignore

Dockerfile
docker-compose.yml

npm-debug.log
.env
.env.*
```

Notes

- dist is ignored because Docker builds it fresh

- tests excluded to keep image lean

- .env ignored (use Docker secrets or env vars instead)

Optional tweaks (if you want)

- If your app needs database migrations or seed files, include them explicitly

- If you run tests in Docker, add a separate test stage

- If this is an API, uncomment and set EXPOSE

If you want, tell me:

- the start script from package.json

- whether this is an API / CLI / worker

- if you use Prisma / TypeORM / Drizzle

…and I’ll fine-tune this exactly to your setup 🔧🔥