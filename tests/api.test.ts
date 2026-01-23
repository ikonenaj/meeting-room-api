import request from "supertest";
import { v4 as uuid } from "uuid";

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

  const roomId = "room1";

  describe("POST /reservations (Adding Reservations)", () => {
    let userId: string;

    beforeEach(() => {
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
      expect(res.body.error).toBe("Invalid startTime format");
    });

    describe("Query Parameter Type Validation", () => {
      // In Express, passing the same key twice (?roomId=a&roomId=b) often results 
      // in an Array, or passing brackets (?roomId[key]=val) results in an Object.
      // Both have typeof === 'object' and should be rejected by your handler.

      it("should return 400 if roomId is passed as an array (duplicate params)", async () => {
        const res = await request(app)
          .get("/reservations")
          // Supertest serializes arrays as &roomId=val1&roomId=val2
          .query({ roomId: ["room1", "room2"] }); 

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("roomId must be a string");
      });

      it("should return 400 if startTime is passed as an object", async () => {
        // Manually constructing the query string to simulate an object payload
        // resulting in req.query.startTime being { invalid: 'true' }
        const res = await request(app)
          .get("/reservations?startTime[invalid]=true");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("startTime must be a string");
      });

      it("should return 400 if endTime is passed as an array", async () => {
        const res = await request(app)
          .get("/reservations")
          .query({ endTime: ["2023-01-01", "2023-01-02"] });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("endTime must be a string");
      });

      it("should allow valid string parameters", async () => {
        // Valid case to ensure we didn't break normal functionality
        const res = await request(app)
          .get("/reservations")
          .query({ roomId: "room1" });

        // Should be 200 (OK)
        expect(res.status).toBe(200);
      });
    });
  });

  describe("GET /own-reservations (User History)", () => {
    let userId: string;
    let otherUserId: string;

    beforeEach(async () => {
      // 1. Manually clear database (since db.clear() doesn't exist)
      const allReservations = db.getReservations({});
      allReservations.forEach(r => db.deleteReservation(r.id));

      // 2. Setup: Generate IDs
      userId = generateUserId();
      otherUserId = generateUserId();

      // 3. Create a reservation for OUR user
      await request(app).post("/reservations").set("x-user-id", userId).send({
        roomId,
        startTime: getFutureDate(1).toISOString(),
        endTime: getFutureDate(2).toISOString()
      });

      // 4. Create a reservation for ANOTHER user (noise data)
      await request(app).post("/reservations").set("x-user-id", otherUserId).send({
        roomId,
        startTime: getFutureDate(3).toISOString(),
        endTime: getFutureDate(4).toISOString()
      });
    });

    it("should return all reservations belonging to the requesting user", async () => {
      const res = await request(app)
        .get("/own-reservations")
        .set("x-user-id", userId);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // We expect 1 reservation (the one we created in beforeEach step 3)
      expect(res.body).toHaveLength(1);
      expect(res.body[0].userId).toBe(userId);
    });

    it("should NOT return reservations belonging to other users", async () => {
      const res = await request(app)
        .get("/own-reservations")
        .set("x-user-id", userId);

      // The DB has 2 reservations total, but we should only see 1
      const otherUserReservation = res.body.find((r: any) => r.userId === otherUserId);
      expect(otherUserReservation).toBeUndefined();
    });

    it("should return an empty list if the user has no reservations", async () => {
      const freshUser = generateUserId();
      
      const res = await request(app)
        .get("/own-reservations")
        .set("x-user-id", freshUser);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should fail with 401 if x-user-id header is missing", async () => {
      const res = await request(app).get("/own-reservations");
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Missing x-user-id header");
    });
  });

  describe("DELETE /reservations/:id (Deletion)", () => {
    let userId: string;
    let reservationId: string;

    beforeEach(async () => {
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