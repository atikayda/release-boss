# Changelog

## 1.5.0 (2025-05-10)

* **changelog:** implement PR-based changelog tracking system ([6b515af](https://github.com/atikayda/release-boss/commit/6b515afcfbc0b519b2f2037fcef7db34cd57e72a))  6b515af
* **pr:** correct variable name in PR creation process ([e3fc5e4](https://github.com/atikayda/release-boss/commit/e3fc5e4aac81eb1ef846c9ae11cc133629fc0a9e))  e3fc5e4
* **changelog:** add defensive programming to changelog table functions ([88672b6](https://github.com/atikayda/release-boss/commit/88672b67a4c478f99ba4fc12f2f6536e8e8eb1bc))  88672b6
* **chore:** rename commits parameter to changelog to match actual type 💅 ([877cd5d](https://github.com/atikayda/release-boss/commit/877cd5d1128fe1dd217f8adba50edb1e74e3d2a6))  877cd5d
* **chore:** enhance commitsToChangelogEntries to handle different commit structures 💁‍♀️ ([45fd00d](https://github.com/atikayda/release-boss/commit/45fd00dc6e8762bb83f10ca754725c9f23f42d0e))  45fd00d
* **feat:** use conventional commits parser instead ([a9de56e](https://github.com/atikayda/release-boss/commit/a9de56e88303cc6b7b22cdaddd9d622fe5b8b1a3))  a9de56e
* **changelog:** improve parsing of formatted changelog content ([7614a07](https://github.com/atikayda/release-boss/commit/7614a07b512418ede3a3851a02509dc5f33c93e4))  7614a07
* **chore:** changelog parsing ([aeb9935](https://github.com/atikayda/release-boss/commit/aeb993550678263c50909a434e1748250fee6043))  aeb9935
* **chore:** changelog parsing ([7274475](https://github.com/atikayda/release-boss/commit/72744754d393a62551f5e93bc03230805ee8b07f))  7274475

## 1.4.5 (2025-04-24)

## [1.4.5](https://github.com/atikayda/release-boss/compare/v1.4.4...v1.4.5) (2025-04-24)

### 🛠️ Bug Fixes & Polish 💅

* handle 'not a fast forward' and 'not found' errors gracefully 💅 ([f9c22a6](https://github.com/atikayda/release-boss/commit/f9c22a6dcbccf5df7ba2384118302a1a16d652ad))



## 1.4.4 (2025-04-24)

## [1.4.4](https://github.com/atikayda/release-boss/compare/v1.4.3...v1.4.4) (2025-04-24)

### 🛠️ Bug Fixes & Polish 💅

* eliminate the not a fast forward issue ([306edea](https://github.com/atikayda/release-boss/commit/306edeabc8872963c24a55253ae780d13222348e))



## 1.4.3 (2025-04-23)

## [1.4.3](https://github.com/atikayda/release-boss/compare/v1.4.2...v1.4.3) (2025-04-23)

### 🛠️ Bug Fixes & Polish 💅

* add ability to cleanup staging branch on close as well as on merge ([097e4ef](https://github.com/atikayda/release-boss/commit/097e4ef581e0ec33dd8b8851cac6f19c5529ebbe))



## 1.4.2 (2025-04-23)

## [1.4.2](https://github.com/atikayda/release-boss/compare/v1.4.1...v1.4.2) (2025-04-23)

### 🛠️ Bug Fixes & Polish 💅

* single commit for merge too ([9951064](https://github.com/atikayda/release-boss/commit/9951064a88429394a94b1453d61866910dab9fc6))
* update merges to use conventional commit merge messages ([09dd3a4](https://github.com/atikayda/release-boss/commit/09dd3a4a5c208468e95226a203d754d976297805))



## 1.4.1 (2025-04-23)

## [1.4.1](https://github.com/atikayda/release-boss/compare/v1.4.0...v1.4.1) (2025-04-23)

### 🛠️ Bug Fixes & Polish 💅

* improve conflict resolution strategy for existing branches 💅 ([712e7ba](https://github.com/atikayda/release-boss/commit/712e7ba3be8e9e57f0cf17fe496f5d40e096064c))



## 1.4.0 (2025-04-23)

## [1.4.0](https://github.com/atikayda/release-boss/compare/v1.3.1...v1.4.0) (2025-04-23)

### ✨ Fabulous New Features ✨

* add fabulous updateFiles feature for line-based search and replace 💅 ([5771af9](https://github.com/atikayda/release-boss/commit/5771af90539e11afe05c67a1f61855e459af3d92))



## 1.3.1 (2025-04-23)

## [1.3.1](https://github.com/atikayda/release-boss/compare/v1.3.0...v1.3.1) (2025-04-23)

### 🛠️ Bug Fixes & Polish 💅

* add fabulous version logging at startup 💅 ([c5aa15d](https://github.com/atikayda/release-boss/commit/c5aa15defce08fb0eb956474705a6c244dfb029f))



## 1.3.0 (2025-04-23)

## [1.3.0](https://github.com/atikayda/release-boss/compare/v1.2.1...v1.3.0) (2025-04-23)

### ✨ Fabulous New Features ✨

* add smart conflict resolution strategy for merge conflicts ([c163e15](https://github.com/atikayda/release-boss/commit/c163e154c729520e455fee978761bfbb47d62c73))



## 1.2.1 (2025-04-23)

## [1.2.1](https://github.com/atikayda/release-boss/compare/v1.2.0...v1.2.1) (2025-04-23)

### 🛠️ Bug Fixes & Polish 💅

* make default config detection work as advertised 📺 ([ddde872](https://github.com/atikayda/release-boss/commit/ddde872a5a6fcb84c4093d2bc3a73fc771088a2a))
* make the default flow gitflow-like ([8522041](https://github.com/atikayda/release-boss/commit/85220415cf2d8c14337ef330cba39a86567c89a3))
* add missing @octokit/rest dependency for GitHub API access ([3c2baa0](https://github.com/atikayda/release-boss/commit/3c2baa0263849c22f3bf6bdb6e3a2b5e10cf03f7))

### 📝 Documentation Glow-Ups 📚

* add in source asset ([cbac72e](https://github.com/atikayda/release-boss/commit/cbac72e00f4f6049d2890ee71a024a46cb6ec4f4))
* update source assets ([b3305ff](https://github.com/atikayda/release-boss/commit/b3305ffbe765d7263cf03b43af1772de78f8041b))



## 1.2.0 (2025-04-18)

## [1.2.0](https://github.com/atikayda/release-boss/compare/v1.1.0...v1.2.0) (2025-04-18)

### Features

* rebrand to Release Boss with Lady Boss theme 👑💅 ([6bb6293](https://github.com/atikayda/release-boss/commit/6bb6293e24a2445b8ba87cd6a429b916e3fc92a5))
* add gorgeous Release Boss logo and branding assets 💅👑 ([c8ad871](https://github.com/atikayda/release-boss/commit/c8ad871a7e258f23b85407fb251f94cb6220c67a))



## 1.1.0 (2025-04-17)

## [1.1.0](https://github.com/atikayda/release-manager/compare/v1.0.0...v1.1.0) (2025-04-17)

### Features

* add YAML configuration support for GitHub-friendly config ([4240a7b](https://github.com/atikayda/release-manager/commit/4240a7b4be4cc09e8643335c7d809658a295db7b))



## 1.0.0 (2025-04-17)

## [0.0.1](https://github.com/atikayda/release-manager/compare/v0.0.0...v0.0.1) (2025-04-17)

### ✨ Fabulous New Features ✨

* simplify release detection by focusing on branch name instead of PR title ([8a19689](https://github.com/atikayda/release-manager/commit/8a19689c738553c7363b914e31956e869dbf7bb5))

