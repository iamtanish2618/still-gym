import type { Booking } from "./types";
const zone = "Asia/Kolkata";
export const dateKey = (n = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(n);
export const time = (n: number) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(n);
export const day = (n: number) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(n);
export const bookingMessage = (booking: Booking) =>
  booking.status === "waitlisted"
    ? `You’re number ${booking.position} in line. We’ll book you automatically when a mat opens.`
    : booking.status === "confirmed"
      ? `Your mat is reserved. Check-in code: ${booking.code}.`
      : "This reservation was cancelled on another screen. Availability has been refreshed.";
export const navigate = (page: string) => {
  window.location.hash = "/" + page;
};
