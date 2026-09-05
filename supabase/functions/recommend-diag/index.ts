// Retired diagnostic (used once to confirm ANTHROPIC_API_KEY was set). Inert:
// no AI calls, no data, returns 410. Kept only because the platform has no
// delete-function API here.
//
// Committed in the QA review of 2026-09: it was deployed and ACTIVE on the
// project while existing nowhere in this repo, so nothing in a code review
// could see what it did. It does nothing, and now that is checkable.
Deno.serve(() =>
  new Response(JSON.stringify({ gone: true }), {
    status: 410,
    headers: { "content-type": "application/json" },
  })
);
