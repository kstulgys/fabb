/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as autoBook from "../autoBook.js";
import type * as autoBookAttempt from "../autoBookAttempt.js";
import type * as autoBookRules from "../autoBookRules.js";
import type * as book from "../book.js";
import type * as bookingDecision from "../bookingDecision.js";
import type * as bookingStatus from "../bookingStatus.js";
import type * as bookings from "../bookings.js";
import type * as calories from "../calories.js";
import type * as classes from "../classes.js";
import type * as crons from "../crons.js";
import type * as crypto from "../crypto.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as pool_availability from "../pool/availability.js";
import type * as pool_gateway from "../pool/gateway.js";
import type * as pool_parse from "../pool/parse.js";
import type * as pool_scrape from "../pool/scrape.js";
import type * as poolDetails from "../poolDetails.js";
import type * as poolDetailsOps from "../poolDetailsOps.js";
import type * as stats from "../stats.js";
import type * as statsHelpers from "../statsHelpers.js";
import type * as testHelpers from "../testHelpers.js";
import type * as trainingLogs from "../trainingLogs.js";
import type * as users from "../users.js";
import type * as week from "../week.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attendance: typeof attendance;
  auth: typeof auth;
  autoBook: typeof autoBook;
  autoBookAttempt: typeof autoBookAttempt;
  autoBookRules: typeof autoBookRules;
  book: typeof book;
  bookingDecision: typeof bookingDecision;
  bookingStatus: typeof bookingStatus;
  bookings: typeof bookings;
  calories: typeof calories;
  classes: typeof classes;
  crons: typeof crons;
  crypto: typeof crypto;
  http: typeof http;
  migrations: typeof migrations;
  "pool/availability": typeof pool_availability;
  "pool/gateway": typeof pool_gateway;
  "pool/parse": typeof pool_parse;
  "pool/scrape": typeof pool_scrape;
  poolDetails: typeof poolDetails;
  poolDetailsOps: typeof poolDetailsOps;
  stats: typeof stats;
  statsHelpers: typeof statsHelpers;
  testHelpers: typeof testHelpers;
  trainingLogs: typeof trainingLogs;
  users: typeof users;
  week: typeof week;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
