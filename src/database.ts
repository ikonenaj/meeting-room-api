import { Reservation, Room } from "./types";

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

class Database {
  private reservations: Reservation[] = [];

  getReservation(id: string): Reservation | undefined {
    return this.reservations.find(r => r.id === id);
  }

  getReservations(filter: { roomId?: string; start?: Date; end?: Date }): Reservation[] {
    return this.reservations.filter(r => {
      let match = true;
      if (filter.roomId) match = match && r.roomId === filter.roomId;

      if (filter.start || filter.end) {
        const start = filter.start ? filter.start : new Date(0);
        const end = filter.end ? filter.end : new Date("9999-12-31");
          
        match = match && overlaps(start, end, r.startTime, r.endTime);
      }

      return match;
    });
  }

  getActiveReservationsByUser(userId: string): Reservation[] {
    const now = new Date();
    return this.reservations.filter(
      r => r.userId === userId && r.endTime > now
    );
  }

  addReservation(reservation: Reservation): void {
    this.reservations.push(reservation);
  }

  deleteReservation(id: string): void {
    this.reservations = this.reservations.filter(r => r.id != id);
  }

  isRoomAvailable(roomId: string, start: Date, end: Date): boolean {
    const reservations = this.reservations.filter(r => r.roomId === roomId);
    const conflict = reservations.some(r => overlaps(start, end, r.startTime, r.endTime));
    return !conflict;
  }
}

export const db = new Database();