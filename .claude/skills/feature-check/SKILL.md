---
name: feature-check
argument-hint: [feature, e.g. "cards from a game"; default: the feature just built]
description: After a feature is built, review it for logic errors, unhandled edge cases and security issues, fixing and re-reviewing until a pass finds nothing, then add a manual test checklist for it to docs/backlog.md. Use when the user asks to double-check a feature, or for the test checklist after a feature.
---

# Check a finished feature

Two steps, in this order. The feature is the one named, or the one just built
in this conversation; say in one line which one you took.

## 1. Review until clean

Read every file the feature touches, end to end: server, client, the
state between them, and the helpers they call. Check each of these:

- **Logic:** does each path do what it is meant to? Follow the data from
  input to what is stored and shown.
- **Edge cases:** empty, one, many; first and last; missing or deleted
  things mid-flow; double clicks and repeated submits; two tabs; reloads
  mid-flow; cancel at each stage; slow or failing network; limits and
  very large inputs.
- **Security:** auth on every server entry point (remote functions are not
  covered by the route guard in `hooks.server.js`); ownership of every id
  that comes from the client; input validation; injection (SQL, shell or
  process arguments, prompt text); internal details leaking in error
  messages; `{@html}` or URL values built from user input; cost or
  denial-of-service through unbounded work.

Fix what is found. Add a test for each bug fixed, and confirm the test fails
without the fix. Then review again, the changed code included. Stop when a
full pass finds nothing. Run the whole test suite and `npx svelte-check
--threshold error` in `web/`, then commit.

A fix that changes a product decision (a cap, a limit, a refusal) is asked
about in one line, not made.

## 2. Test checklist

Add a section for the feature to `docs/backlog.md` under "# Things to test/check",
before "# Needed before launch", in that file's style:

- `## <Feature>`, then `###` groups in the order the user meets them
- one `[ ] ` line per thing to try, with what should happen, using the UI's
  own words (button labels, messages)
- the edge cases from step 1 included, each one something the user can do
  in the app

`docs/backlog.md` usually holds the user's uncommitted edits: add the section
and leave the file uncommitted.

## Report

One short bullet per problem fixed (what was wrong, in a sentence), the
commit, where the checklist is, and any product question in one line. If
nothing was found, say so in one line.
