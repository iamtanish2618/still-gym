import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("member"),
  },
  (t) => [check("valid_role", sql`${t.role} IN ('member','admin')`)],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    start: integer("start").notNull().unique(),
    capacity: integer("capacity").notNull().default(20),
    title: text("title").notNull().default("Open practice"),
  },
  (t) => [
    check("twenty_mats", sql`${t.capacity}=20`),
    check("ist_hour", sql`(${t.start}+19800000)%3600000=0`),
  ],
);
export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id),
    status: text("status").notNull(),
    code: text("code").notNull().unique(),
    createdAt: integer("created_at").notNull(),
    checkedInAt: integer("checked_in_at"),
  },
  (t) => [
    uniqueIndex("one_active_booking")
      .on(t.userId, t.sessionId)
      .where(sql`${t.status} IN ('confirmed','waitlisted')`),
    index("session_queue").on(t.sessionId, t.status, t.id),
    check(
      "valid_status",
      sql`${t.status} IN ('confirmed','waitlisted','cancelled')`,
    ),
  ],
);
export const tokens = sqliteTable("tokens", {
  hash: text("hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});
export const limits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
