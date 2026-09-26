import { connection } from "next/server"

/** Render only when a request is in progress. `next build` cannot reach Railway's private database. */
export function duringRequest() {
  return connection()
}
