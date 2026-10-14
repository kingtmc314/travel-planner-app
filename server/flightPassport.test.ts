import { describe, expect, it } from "vitest";
import {
  formatFlightHours,
  getHongKongDateInput,
  getHongKongYear,
  isIataCode,
  normalizeIataCode,
  parsePositiveWholeNumber,
  resolveFlightDistanceKm,
  resolveFlightHours,
} from "../shared/flightPassport";

const routeDistances: Record<string, number> = {
  "HKG-NRT": 2962,
  "KMI-FUK": 188,
  "CAI-ASW": 681,
};

function estimateDistance(departureAirport: string, arrivalAirport: string): number {
  return routeDistances[`${departureAirport}-${arrivalAirport}`] ?? 0;
}

function estimateHours(distanceKm: number): number {
  return distanceKm > 0 ? distanceKm / 800 + 1 : 0;
}

describe("flight passport calculation helpers", () => {
  it("normalises IATA codes before calculation and validates exactly three letters", () => {
    expect(normalizeIataCode(" hkg ")).toBe("HKG");
    expect(isIataCode("nrt")).toBe(true);
    expect(isIataCode("HK")).toBe(false);
    expect(isIataCode("HKG1")).toBe(false);
  });

  it("uses a valid stored distance or calculates a route with normalised IATA codes", () => {
    expect(resolveFlightDistanceKm({ distanceKm: "662" }, estimateDistance)).toBe(662);
    expect(resolveFlightDistanceKm({ departureAirport: " kmi", arrivalAirport: "fuk " }, estimateDistance)).toBe(188);
    expect(resolveFlightDistanceKm({ departureAirport: "XXX", arrivalAirport: "YYY" }, estimateDistance)).toBe(0);
  });

  it("uses explicit duration when supplied and otherwise makes a safe estimate", () => {
    expect(resolveFlightHours({ durationMinutes: "110" }, estimateDistance, estimateHours)).toBeCloseTo(110 / 60);
    expect(resolveFlightHours({ departureAirport: "CAI", arrivalAirport: "ASW" }, estimateDistance, estimateHours)).toBeCloseTo(681 / 800 + 1);
    expect(resolveFlightHours({ departureAirport: "XXX", arrivalAirport: "YYY" }, estimateDistance, estimateHours)).toBe(0);
  });

  it("rejects invalid non-positive or fractional values for persisted metrics", () => {
    expect(parsePositiveWholeNumber("662")).toBe(662);
    expect(parsePositiveWholeNumber("0")).toBeNull();
    expect(parsePositiveWholeNumber("-15")).toBeNull();
    expect(parsePositiveWholeNumber("1.5")).toBeNull();
  });

  it("formats rounded minutes without ever rendering 60 minutes", () => {
    expect(formatFlightHours(1 + 59.6 / 60)).toBe("2h 0m");
    expect(formatFlightHours(25.5)).toBe("1d 1h");
    expect(formatFlightHours(Number.NaN)).toBe("0h 0m");
  });

  it("uses Hong Kong calendar dates and years at UTC day boundaries", () => {
    const utcEvening = new Date("2026-06-18T16:30:00.000Z");
    expect(getHongKongDateInput(utcEvening)).toBe("2026-06-19");
    expect(getHongKongYear(utcEvening)).toBe(2026);
  });
});
