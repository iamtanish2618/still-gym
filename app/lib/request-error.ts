import type { Fields } from "./types";
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Fields = {},
  ) {
    super(message);
  }
}
