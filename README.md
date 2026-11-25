# Open File in Repository

![Open File in Repository icon](media/icon.png)

A **Visual Studio Code** extension (not the Visual Studio IDE). Right-click a
file in the Explorer or an open editor tab to find a separated group:

- **Open Repository** opens the repository homepage.
- **Open File In Repository** opens that file on the checked-out branch.
- **Compare Branch Against Branch in Repository** opens the website's
  repository-wide base-to-current-branch comparison, without a file anchor.
  Every invocation asks you to enter the base branch (for example `develop` or
  `main`, without `origin/`). Confirm to open the comparison; Escape cancels without
  opening a browser. Empty values and the current branch are rejected.
- **Compare Branch Against Branch Locally** opens a VS Code diff for the selected file:
  the prompted branch's committed version on the left, your current working file
  on the right, including saved and unsaved local edits. Enter a local branch name
  or a locally available remote-tracking branch such as `origin/develop`.
  No remote or network access is required. Missing branches/files and binary files
  produce errors; renamed files are not matched automatically. Escape cancels.

Commands also work from the Command Palette using the active saved file.
The selected file determines the repository, including nested repositories,
submodules, worktrees and multi-root workspaces. Git operations are read-only;
the extension never fetches, pushes, changes branches or modifies files.

## Providers and configuration

GitHub, GitLab, Bitbucket Cloud and Azure DevOps are detected from their public
hostnames. HTTPS, HTTP and SSH remotes (including `git@host:owner/repo.git`) are
converted to credential-free HTTPS browser links.

Settings are resource-scoped, so workspace/folder overrides can differ:

- `openFileInRepository.remote`: optional remote override. Otherwise the branch's
  upstream remote wins, then `origin`, then the sole remote; ambiguous choices prompt.
- `openFileInRepository.baseBranch`: optional prefilled value for the prompt,
  without remote prefix. You can edit it before confirming. Compare always prompts,
  even when this setting is configured. The entered value is not saved automatically.
  No branch-origin detection or remote-default fallback is performed.
- `openFileInRepository.provider`: `auto`, `github`, `gitlab`, `bitbucket`, or
  `azure`. Use an explicit provider for compatible self-hosted installations.
- `openFileInRepository.urlTemplates`: provider-agnostic overrides for
  `repository`, `file`, and `compare`. Unknown hosts can still open their repository
  homepage; file and comparison commands require a provider or template.

For example, a different Git web frontend:

```json
{
  "openFileInRepository.urlTemplates": {
    "repository": "{repository}",
    "file": "{repository}/src/branch/{branch}/{path}",
    "compare": "{repository}/compare/{base}...{branch}"
  }
}
```

Templates must produce HTTPS URLs without credentials. References are encoded as
single values; `{path}` encodes each file-path segment, preserving `/` separators.
`{repository}` is the normalized HTTPS remote URL.

Git must be installed (the VS Code `git.path` setting is respected). Only saved,
local filesystem files in trusted workspaces are supported. File and comparison
commands require a checked-out branch; repository homepage works in detached HEAD.
Online commands reject untracked files. Commit **and push** local files/branches first:
browser pages show remote content, not uncommitted edits. The extension does not
check remote existence or infer pull-request target branches. GitHub's
three-dot comparison shows changes since the merge base.
GitHub's "There isn't anything to compare" can also mean that the head
or base reference does not exist on the selected remote: push the feature branch
and check that the selected remote contains the base branch.

## Development

The extension icon is `media/icon.png` (256 x 256), with editable vector artwork
in `media/icon.svg`.

The npm/script workflow follows the local AppConfigVSCode project:

```powershell
npm ci
npm run build
npm run lint
npm test
npm run test:extension
npm run package
```

`build` cleans and compiles TypeScript into `out`; `test` builds and runs Node unit
tests. `test:extension` builds and runs an isolated VS Code Extension Development
Host smoke test; it downloads VS Code unless `VSCODE_EXECUTABLE` points to an
existing executable. Press F5 to debug and manually inspect both context menus.
`package` runs lint/tests through `vscode:prepublish` and creates
`dist/open-file-in-repository-1.0.10.vsix`. Install it with **Extensions: Install
from VSIX…**, then reload the window if VS Code requests it so the menu and running
commands use the same version. No script publishes to the Marketplace.
