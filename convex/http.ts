import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Registers the Convex Auth HTTP endpoints (e.g. /api/auth) on the deployment.
auth.addHttpRoutes(http);

export default http;
