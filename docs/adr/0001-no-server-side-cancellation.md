# No server-side cancellation

The pool cancels a booking only via a secret token embedded in the confirmation
email it sends the booker; that token cannot be derived from the `pid`, date, or
session, so the server can never cancel a Booking it placed. We therefore build
**no in-app cancellation**: the pool emails each User a working cancel link, and
the UI states plainly that disabling an AutoBook rule stops future bookings but
does not undo one already placed. Revisit (paste-the-link cancel, as in the fabb
skill's Mode 3) only if users demand it.
