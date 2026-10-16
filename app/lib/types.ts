export type User = {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: "member" | "admin";
};
export type Session = {
  id: number;
  title: string;
  start: number;
  capacity: number;
  remaining: number;
  waiting: number;
  my_status: string | null;
};
export type Booking = {
  id: number;
  session_id: number;
  title: string;
  start: number;
  status: string;
  code: string | null;
  position: number | null;
  checked_in_at: number | null;
  name?: string;
  email?: string;
};
export type Fields = Record<string, string>;
export type ApiResponse = {
  user: User;
  sessions: Session[];
  bookings: Booking[];
  serverTime: number;
  booking: Booking;
  error?: { message: string; fields: Fields };
};
