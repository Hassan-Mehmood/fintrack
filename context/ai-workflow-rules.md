# AI Workflow Rules

## Overall Approach

* Follow the written specifications before writing code.
* Work incrementally and complete one functional unit at a time.
* Prefer simple implementations that satisfy the current requirement.
* Do not add architecture, abstractions, dependencies, or features that are not required.

## Scoping

* Change only the files required for the current unit.
* Do not refactor unrelated code.
* Do not implement future features speculatively.
* Do not rename, move, or delete existing files without a clear requirement.
* Keep each change small, reviewable, and independently testable.

## Splitting Work

* Split the task when it affects multiple modules, database changes, API endpoints, and UI together.
* Split the task when it cannot be verified with one clear test or user flow.
* Complete backend logic before connecting the frontend when both are required.
* Finish and verify each step before starting the next one.

## Missing or Ambiguous Requirements

* Do not invent business rules.
* Check `project-overview.md`, `architecture.md`, and `code-standards.md` first.
* Ask for clarification when ambiguity affects data models, financial calculations, ownership, or user-visible behavior.
* State any minor assumption before implementing it.
* Choose the smallest reversible option when clarification is unnecessary.

## Protected Files

Do not modify the following without explicit instruction:

* Generated shadcn/ui components
* Generated API clients
* Prisma migration files that have already been applied
* Lockfiles, unless dependencies change
* Environment files and secrets
* CI/CD and deployment configuration
* Shared design tokens
* Architecture and product scope documents

Extend generated components through wrappers or feature components instead of editing them directly.

## Documentation

* Update documentation whenever implementation changes an API, data model, folder responsibility, feature scope, or invariant.
* Keep examples and folder paths consistent with the codebase.
* Do not document planned behavior as if it already exists.
* Remove or revise documentation that becomes inaccurate.

## Verification Before Moving On

Before starting the next unit:

* Confirm the implementation matches the specification.
* Run formatting, linting, and type checking.
* Run relevant unit and integration tests.
* Verify authentication and ownership checks.
* Verify financial calculations use decimal-safe values.
* Test the main success path and expected failure paths.
* Confirm no unrelated files were changed.
* Confirm documentation is still accurate.
* Summarize what changed and any remaining limitations.
