// Base URL of the FastAPI backend.
// Set NEXT_PUBLIC_API_URL when the API is not on localhost (e.g. a deployed frontend);
// docker-compose already passes it to the frontend service.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
