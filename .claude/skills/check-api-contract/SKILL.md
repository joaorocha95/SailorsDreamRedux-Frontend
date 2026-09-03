---
name: check-api-contract
description: Check src/types/api.ts and the client's request handling against the Spring backend it mirrors. Run at the start of a roadmap phase, or after the backend changes.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash
---

# Check the API contract

`src/types/api.ts` is mirrored **by hand** from the backend's DTO records — there is no OpenAPI
document to generate from — so nothing detects drift automatically. This checks it.

Scope: `$ARGUMENTS` if given (a DTO name, an endpoint, or a roadmap phase). Otherwise check
everything.

## Where the truth lives

The backend is a sibling checkout at `../sailors-dream-redux`:

| What | Path |
| --- | --- |
| DTO records | `src/main/java/org/project/sailorsdreamredux/domain/dto/` |
| Controllers | `src/main/java/org/project/sailorsdreamredux/**/*Controller.java` |
| Written reference | `docs/reference.html` |

If that directory is absent, say so and stop rather than guessing — a check against remembered
shapes is worse than no check, because it reads as authoritative.

## Steps

1. **Confirm the backend checkout exists**, and note its current commit
   (`git -C ../sailors-dream-redux log --oneline -1`) so the answer is dated.

2. **Diff the DTOs.** For each record in `domain/dto/`, find its counterpart in
   [api.ts](../../../src/types/api.ts) and compare field by field:
   - fields present in Java but missing from TypeScript, and the reverse;
   - **nullability** — a Java field that can be null must be `| null` here, and a `| null` that the
     server never sends is a state the UI handles for nothing;
   - types, especially `BigDecimal` → `string` (never `number`; prices must not go through a float)
     and temporal types → `string`.
   Report DTOs with no TypeScript counterpart separately — several are unbuilt phases, not drift.

3. **Check the invariants** in [references/invariants.md](references/invariants.md) against the
   client code that exists today. These are contract rules that type checking cannot catch: they
   are about which values are legal together, and which errors mean what.

4. **Report.** Group as *drift* (the two disagree — a bug), *unmirrored* (backend has it, the
   client has not reached that phase), and *invariant risks* (code that will 400 or 403 in a case
   not yet handled). Cite `file:line` on both sides. Propose edits; do not apply them without being
   asked.
