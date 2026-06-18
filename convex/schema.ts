import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/**
 * App schema.
 *
 * Convex Auth owns the auth tables (`...authTables`). We re-declare `users` to
 * extend it with the app-specific fields that later slices fill in, while
 * keeping every field and index Convex Auth relies on (`email`, `phone`).
 *
 * Canonical `users` shape (see `.git/sdd/constraints.md`):
 *   auth identity + `poolDetails{name,surname,phone,email}` + `detailsComplete`.
 * Both app-specific fields are optional here so a freshly signed-up account is
 * valid before the User has filled in their pool details.
 */
const schema = defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Auth managed identity fields — must mirror `authTables.users`.
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App-specific (extended by later slices).
    poolDetails: v.optional(
      v.object({
        name: v.string(),
        surname: v.string(),
        phone: v.string(),
        email: v.string(),
      }),
    ),
    detailsComplete: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
});

export default schema;
