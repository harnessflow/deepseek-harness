---
description: "Native Desktop inputs for independently branded distributions, private local state, bundled extensions, and manual upgrades."
---

# Standalone Desktop distributions

English | [中文](standalone-desktop.zh.md)

## Summary

Distributors can build one independently identified Desktop application without installing the official application beside it. The application keeps the native workbench, Desktop Host, runtime preparation, signing checks, and plugin composition. Explicit product inputs select private state, artwork, and mandatory local bundles. A manual distribution has no official update feed or mandatory-update policy; platform installation still requires separate validation.

## Table of Contents

- [Distribution inputs](#distribution-inputs)
- [State and recovery](#state-and-recovery)
- [Packaging boundaries](#packaging-boundaries)
- [Verification](#verification)
- [Dev Note](#dev-note)

-----

## Distribution inputs
<a id="distribution-inputs"></a>

The deployment launcher supplies `DSH_DESKTOP_PRODUCT` as a validated JSON identity and `DSH_DESKTOP_PRODUCT_ARTWORK` as an absolute artwork directory. The record selects product and package names, version, app ID, artifact prefix, OS protocol, home directory, personal-agent subdirectory, mandatory bundle, and `manual` update mode. Omitted metadata preserves the official defaults; invalid standalone metadata fails instead of falling back to those defaults. The internal `dsh-app` protocol and upstream package names remain unchanged.

Development additionally supplies `DSH_DESKTOP_PRODUCT_HOME` and `DSH_DESKTOP_PRODUCT_PACKAGES`, an explicit package-to-absolute-directory JSON object. Package names cannot replace the upstream namespace or escape the generated project. The macOS development launcher records product identity, artwork, and runtime location for OS-initiated cold starts. Packaged applications read their embedded `dshDesktopProduct` manifest record instead of an inherited product JSON variable.

The shell supplies `DSH_DESKTOP_PRODUCT_BUNDLE` to its private Host. The Host validates that bundle in the runtime manifest and uses that manifest as the native installation-resolution anchor, so explicit external client packages remain discoverable even when development packages are source links. The official distribution keeps its CLI-package anchor.

For an external development composition, the disposable runtime manifest declares every package already mirrored into its own `node_modules`. Native ESM resolution therefore uses the runtime's physical package links rather than a source peer accidentally discovered through pnpm's CommonJS-only `NODE_PATH`. No external source directory is modified.

## State and recovery
<a id="state-and-recovery"></a>

The shell resolves private state before opening Electron storage or starting Desktop Host. Installed homes use `<PROTOCOL>_HOME` or the product's home directory beneath the OS user home; development-only home overrides do not apply to installed applications. Resolution rejects overlap with official default and inherited custom homes, development/installed overlap, dangling links, and redirected state children. Electron browser data, logs, profiles, personal agents, sessions, native `storages`, runtimes and the default workspace remain under the selected private home. Home-level `.credentials.yaml`, `.env`, `cordis.patch.yml` and the desktop profile's manifest and patch cannot be symbolic links, including dangling links; validation does not read or change their contents or targets. Explicit user-selected workspaces and their project credentials keep the native mechanism.

The parent process retains inherited official-root variables for restart checks. Only Desktop Host receives private `DSH_HOME` and `DSH_AGENTS_HOME` values. Native credential lookup order, approval, sandbox behavior, and persistence formats are unchanged. Profile recovery retains mandatory distribution bundles, and missing packaged bundles produce a reinstall error instead of a silently reduced application.

The fixed offline dependency installation at `dsh-runtimes/dsh-primary-runtime` and its `.previous` recovery directory are checked independently of their parent. Redirecting either directory cannot reuse another distribution's payload or promote its recovery link. The native dependency installation and rollback mechanism remains unchanged; these are startup ownership checks, not protection against same-user filesystem races.

## Packaging boundaries
<a id="packaging-boundaries"></a>

The native assembler adds `DSH_DESKTOP_PRODUCT_TARBALLS` to its explicit local package inputs and includes the mandatory bundle's dependency closure. Missing distribution dependencies do not fall back to downloading a private package from a registry. Desktop Host receives the bundle's installed `resources/skills` path through `DSH_DESKTOP_BUNDLED_SKILL_DIR`; the bundle owns its plugin configuration and Skill contents. The builder unpacks that directory with its native `asarUnpack` rule, and installed Hosts receive the physical `app.asar.unpacked/dsh` resource path so Python and other native commands can read it. Development Hosts keep their existing runtime-directory path; no resource extraction on first use is required.

Manual distributions omit both the feed and mandatory-update policy, including when official policy variables are inherited. Product version and engine version remain separate: the product labels the installer while native runtime compatibility checks retain the engine version. `DSH_DESKTOP_RELEASE_ENV_FILE` selects the distribution's own signing configuration; native host, signing, notarization, and payload guards still apply. This contract does not authorize publishing packages or product assets.

## Verification
<a id="verification"></a>

The [standalone tests](../../apps/desktop/tests/product.spec.ts) cover identity rejection, private state, manual builder configuration, recovery, and package closure. The [development tests](../../apps/desktop/tests/development-app.spec.ts) execute literal cold-start launcher fixtures, and [project tests](../../apps/desktop/tests/development-project.spec.ts) cover external package validation. These checks and the native Desktop build are local evidence, not installed-platform or real-model audit evidence. Windows installer execution and signing require their native platform resources.

## Dev Note
<a id="dev-note"></a>

<details>
<summary>Development context</summary>

None.

</details>
