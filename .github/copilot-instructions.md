# Project context

This project is a Visual Studio Code extension using JavaScript and TypeScript.
Its intended file context menu actions are:

- **Open in repository**: open the selected file in its remote repository.
- **Open repository**: open the remote repository.
- **Open repository and diff against base branch**: open a repository comparison
  against the base branch.

The repository currently has no extension implementation or build configuration.
Do not assume that command IDs, scripts, tests, or repository providers already
exist. Inspect the current code and configuration before making changes.

## Development conventions

- Prefer TypeScript for new extension code and keep existing JavaScript consistent
  with its surrounding code. Do not introduce another language or framework
  without a concrete need.
- Keep changes focused. Reuse existing utilities and conventions before adding
  dependencies or abstractions.
- Use supported VS Code APIs and types. Keep command registrations, activation,
  disposables, and `package.json` contributions consistent.
- Context menu commands must use the selected file URI, not assume that the active
  editor contains that file. Handle missing selections and unsupported URI schemes
  with clear feedback.
- Resolve the Git repository containing the selected file. Account for multi-root
  workspaces and nested repositories; do not assume the workspace root is the
  repository root.
- Keep Git operations read-only unless the requested feature explicitly requires
  otherwise. Never change branches, modify files, or discard user work merely to
  construct a URL.
- Avoid shell interpolation of paths, branch names, or remote URLs. Prefer an
  existing Git integration or argument-based process invocation.
- Parse remote URLs deliberately, including supported HTTPS and SSH forms.
  Encode URL path segments and references correctly, and use
  `vscode.env.openExternal` for external links.
- Preserve provider-specific URL behavior. Do not assume every Git host uses
  GitHub routes or supports the same comparison syntax.
- Do not hard-code `main` or `master` as the base branch. Follow established
  configuration or Git metadata. If the comparison direction, base branch, or
  remote is ambiguous and no convention exists, clarify the intended behavior.
- Surface missing repositories, missing remotes, unsupported providers, and Git
  failures through actionable VS Code messages. Do not silently swallow errors
  or log credentials embedded in remote URLs.

## Validation and documentation

- Use the scripts and tooling actually defined in the repository; do not invent
  build, lint, or test commands.
- For code changes, run the smallest relevant existing tests and type/build
  checks. Add focused regression tests for introduced or fixed behavior.
- Where applicable, test remote parsing, URL encoding, selected-file repository
  resolution, comparison references, and failure handling.
- Validate context menu visibility and command behavior in an Extension
  Development Host when changing VS Code integration. State explicitly when
  interactive validation was not performed.
- Update directly related user documentation when commands, settings, supported
  providers, or behavior change.
