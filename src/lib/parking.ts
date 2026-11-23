import { ParkingAssignmentStatus, ParkingEventType, ParkingSlotType, VehicleType } from "@prisma/client";

export function normalizePlateNumber(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function displayPlateNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function isValidIndianPlateNumber(value: string): boolean {
  const plate = normalizePlateNumber(value);
  return /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/.test(plate) ||
    /^\d{2}BH\d{4}[A-Z]{2}$/.test(plate);
}

export function isValidForeignPlateNumber(value: string): boolean {
  const plate = normalizePlateNumber(value);
  return plate.length >= 2 && plate.length <= 24 && /^[A-Z0-9]+$/.test(plate);
}

export function preferredParkingSlotType(type: VehicleType): ParkingSlotType {
  if (type === "BIKE") return "BIKE";
  if (type === "EV") return "EV";
  return "CAR";
}

export function getParkingAssignmentTransition(
  type: ParkingEventType,
  status: ParkingAssignmentStatus
): ParkingAssignmentStatus | null {
  if (type === "ENTRY" && status === "RESERVED") return "OCCUPIED";
  if (type === "EXIT" && (status === "OCCUPIED" || status === "OVERSTAY")) return "RELEASED";
  return null;
}

export function maskPlateNumber(value: string): string {
  return `***${normalizePlateNumber(value).slice(-2)}`;
}
