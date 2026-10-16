export class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export const fail = (status, code, message, fields) => {
  throw new ApiError(status, code, message, fields);
};
export const response = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
export const invalid = (fields) =>
  fail(422, "VALIDATION", "Please check the highlighted fields.", fields);
