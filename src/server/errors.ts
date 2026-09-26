export class ApiError extends Error {
  status: number
  errors?: unknown

  constructor(status: number, message: string, errors?: unknown) {
    super(message)
    this.status = status
    this.errors = errors
  }
}
