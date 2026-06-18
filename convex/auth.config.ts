export default {
  providers: [
    {
      // Convex Auth issues JWTs from the deployment's own site URL.
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
