# Releasing OpenPress

`VERSION.md` at the repository root is the only version that gets published. Git tags, GitHub Releases, container tags, and the npm packages below all follow that file. Pushing a higher version to `main` is the release. The GitHub Release notes are the auto-generated changelog since the previous tag. This file does not store notes.

## Version file

```text
<!-- The only version line is the current OpenPress release. -->
0.3.0
```

Rules the workflow enforces:

- The file contains one strict semver line and nothing else, aside from an optional one-line comment. `MAJOR.MINOR.PATCH`, optional prerelease (`1.0.0-beta.1`). No leading `v`, no leading zeros, no `+build` metadata, no history, and no release-notes section.

`0.3.0` is the first version cut from this file. Earlier package versions (`0.1.0`, `0.2.0`) were not tagged from it.

## Cut a release

1. On a branch from `main`, run one of:

   ```bash
   pnpm release:bump patch
   pnpm release:bump minor
   pnpm release:bump major
   ```

   A stable `0.3.0` becomes `0.3.1`, `0.4.0`, or `1.0.0`. A prerelease promotes the way `npm version` does: `1.0.0-beta.1` patch becomes `1.0.0`, and `1.0.0-beta.1` major becomes `1.0.0`.

2. The bump also sets the versions in:

   - `packages/plugin-sdk`
   - `packages/theme-sdk`
   - `packages/create-openpress` (version only; this package is not published)
   - the fallback core version in `apps/api/src/extensions/plugin-manifest.ts`

   The API reads `VERSION.md` at startup when that file is present.

3. Open a pull request. The **Version file** check fails when `VERSION.md` is not valid semver. It warns, and still passes, when the version number did not change.

4. Merge to `main`. The **Release** workflow runs.

You can also edit the version line by hand, including a prerelease such as `0.4.0-beta.1`, as long as the line stays valid.

## What the workflow publishes

The workflow compares `VERSION.md` with the highest existing `v*` tag. Comparison is semver, so `1.0.0-beta.2` is lower than `1.0.0` and `1.0.0-beta.10` is higher than `1.0.0-beta.2`. Tags that are not strict semver are ignored.

| `VERSION.md` vs newest tag | Result |
|---|---|
| Higher | Tag `vX.Y.Z`, GitHub Release, images, npm |
| Same | Skip, job succeeds. The log says the version already matches. |
| Lower | Skip, job succeeds. A lower version is not republished. |

A prerelease GitHub Release is marked as a prerelease. The body is GitHub's generated changelog since the previous lower tag (`gh release create --generate-notes`).

Release assets:

- `openpress-X.Y.Z.tar.gz` (source archive of that commit)
- `docker-compose.prod.yml` (build from source)
- `docker-compose.ghcr.yml` (pull the published images)

The workflow uses a concurrency group named `openpress-release` and does not cancel the run already in progress. Creating the tag, the Release, and an npm version that already exists is skipped instead of failing, so a re-run that has not finished those steps can continue.

If a run fails **after** the tag exists, a later push of the same version skips. Re-run it from the Actions tab with **Release → Run workflow → retry**. Retry reuses the tag, refreshes the notes, and publishes anything that is not already there. Do not retry a version that is lower than a newer tag.

## Container images

Pushed to GHCR with `GITHUB_TOKEN` (`packages: write`) for `linux/amd64` and `linux/arm64`:

- `ghcr.io/foisalislambd/openpress-api`
- `ghcr.io/foisalislambd/openpress-web`

Stable `1.4.2` is tagged `1.4.2`, `1.4`, `1`, and `latest`. A prerelease is tagged only with its full version (`1.4.2-beta.1`), so it does not move `latest` or the floating major/minor tags.

Images carry OCI labels for the version, git revision, source repository, and MIT license.

```bash
docker pull ghcr.io/foisalislambd/openpress-api:0.3.0
docker pull ghcr.io/foisalislambd/openpress-web:0.3.0
```

Or, from a GitHub checkout, print a Compose file pinned to a version. This does not pull images and does not use npm:

```bash
node packages/create-openpress/bin/create-openpress.mjs compose 1.0.7 > docker-compose.ghcr.yml
```

`npx create-openpress compose` is not available. `create-openpress` is not published.

The first push creates the GHCR packages. GitHub often leaves a new package private even when the repository is public. Open each package's settings, link it to `foisalislambd/openpress`, and set the visibility to public if `docker pull` should work without a login.

## npm packages

| Package | What it is |
|---|---|
| `@openpress/plugin-sdk` | Types for `plugin.json` and `activate(ctx)`. Published by the Release workflow. |
| `@openpress/theme-sdk` | Types for `theme.json`. Published by the Release workflow. |
| `create-openpress` | Project scaffolder. **Not published.** `"private": true`. The workflow's publish loop is `packages/plugin-sdk` and `packages/theme-sdk` only, and it exits if that loop ever names `create-openpress` or a private package. |

The workflow sets the SDK versions, and the `create-openpress` version, from `VERSION.md` before publishing the SDKs. Stable SDK versions use the `latest` dist-tag. Prereleases use `next`.

```bash
npm install -D @openpress/plugin-sdk @openpress/theme-sdk
```

Use the scaffolder from a checkout, not from npm:

```bash
node packages/create-openpress/bin/create-openpress.mjs ../my-site --yes
```

`npx create-openpress` and `npm create openpress` are the future commands. They are not published. The npm name is provisional and this document does not claim it is available. A future publish has to remove `"private": true`, confirm the registry name, and add the package to the workflow on purpose. Do not do that as part of an unrelated release.

Publish of the two SDK packages uses `npm publish --provenance --access public`. Provenance needs the workflow `id-token: write` permission, which this repository's release workflow sets. It also needs `NPM_TOKEN`. The `create-openpress` GitHub Actions workflow only runs tests and has `contents: read`.

### If `NPM_TOKEN` is missing

The npm job prints a warning and exits successfully. The git tag, GitHub Release, and container images still publish. Add the secret and run the workflow again with **retry** to publish the packages for that same version.

### Names that were free on 2026-11-02

The registry returned 404 for `@openpress/plugin-sdk`, `@openpress/theme-sdk`, and `create-openpress` on that date. `@open-press/*` (with a hyphen) is a different project. Do not publish there. `create-openpress` stays unpublished: the name was not re-checked for this change and is not reserved by this repository.

`@openpress` is an organization scope, not the GitHub user `foisalislambd`. npm will reject the first publish until that organization exists and the token can write to it.

## Secrets and access the owner sets up once

1. **npm organization.** Create an organization named `openpress` at [npmjs.com/org/create](https://www.npmjs.com/org/create) with the account that should own the scope. Public packages are free.
2. **`NPM_TOKEN`.** In npm, create a granular access token (or an automation token) that can publish `@openpress/plugin-sdk` and `@openpress/theme-sdk`. Do not grant it a publish path for `create-openpress` while that package is source-only. Enable bypass for 2FA / CI so Actions can publish the SDKs. Add it to the GitHub repository as a secret named exactly `NPM_TOKEN` (Settings → Secrets and variables → Actions).
3. **Actions permissions.** Settings → Actions → General → Workflow permissions: read and write, so the workflow can push tags and create Releases. The workflow already requests `contents: write`, `packages: write`, and `id-token: write`.
4. **GHCR visibility.** After the first release, set `openpress-api` and `openpress-web` to public if pulls should be anonymous.
5. **Package link.** On each GHCR package, connect it to this repository so the token from Actions keeps working.

No other secret is required for the git tag, the GitHub Release, or the images. `GITHUB_TOKEN` is provided by Actions.
