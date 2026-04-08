export class LaunchpadError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends LaunchpadError {
  constructor(message: string) {
    super(message, "not_found", 404);
  }
}

export class UnauthorizedError extends LaunchpadError {
  constructor(message: string) {
    super(message, "unauthorized", 401);
  }
}

export class ConflictError extends LaunchpadError {
  constructor(message: string) {
    super(message, "conflict", 409);
  }
}

export class ValidationError extends LaunchpadError {
  constructor(message: string) {
    super(message, "validation_error", 400);
  }
}

export class ExternalServiceError extends LaunchpadError {
  constructor(message: string) {
    super(message, "external_service_error", 502);
  }
}

