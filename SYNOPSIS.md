# Release Manager - Project Synopsis

## Overview

This project aims to create a simplified, self-contained GitHub Action called "release-manager" that provides a streamlined version of the functionality currently offered by [release-please](https://github.com/googleapis/release-please) and [release-please-action](https://github.com/google-github-actions/release-please-action). The core focus is on simplicity and specific version management needs.

## How release-please Currently Works

The current release-please system:

1. **Analyzes commits**: Uses conventional commit format to determine what type of semver bump to perform (patch, minor, or major)
2. **Creates release PRs**: Generates a pull request with version bumps and changelog updates
3. **Tags releases**: When the PR is merged, it tags the release branch with the new version
4. **Updates version references**: Can update version references in various files with language-specific patterns

The ecosystem consists of:
- **release-please**: The core library that handles the versioning logic
- **release-please-action**: A GitHub Action wrapper that makes the functionality available in GitHub workflows

## Our Simplified Approach

The release-manager will:

1. Create a simplified, self-contained GitHub Action that doesn't rely on external dependencies
2. Implement the core functionality of generating release PRs based on conventional commits
3. Calculate semver bumps (patch, minor, major) based on commit types
4. Generate a changelog from the commits
5. Allow version updates in files using a simple template-based approach

## Version Update Mechanism

Unlike release-please's language-specific updaters, we'll implement a simpler inline or external template-based mechanism:

### Version files

1. Version files can include template markers in the format:
   ```
   // %%release-manager: const Version = 'v{{version}}'%%
   or
   /* %%release-manager:
   const Version = 'v{{version}}'
   const Major = '{{major}}'
   const Minor = '{{minor}}'
   const Patch = '{{patch}}'
   %% */
   ```

2. The format of the template markers is:
   ```
   <start of line>
   <any characters>
   '%%release-manager: '
   <template>
   '%%'
   <any characters>
   <end of line>
   ```
   The content of the line before the template start and after the template end markers is unimportant, and the template content itself may span multiple lines.

3. The tool will process all specified files:
   - Identify these template start markers
   - Extract the template definition between the start and the next end markers
   - Leave the template in the file
   - Render the template with the proposed version values
   - Calculate how many lines the rendered template will span
   - Delete the following number of lines equal to the calculated number of lines
   - Insert the rendered template lines into the file
   - Leave the original template comment intact

### Template files

Template files are treated as if the whole file is a template
The file will be processed line by line, and the tool will replace the template markers with the appropriate values.

The file will be written to a new file in the same directory, if the filename contains `.tpl` in the name anywhere this will be removed and used as the destination filename.

If the file does not contain the `.tpl` string, the tool will add a `.new` string to the destination filename.

The tool will process the entire file line-by-line and replace `{{version}}`, `{{major}}`, `{{minor}}`, `{{patch}}` with the appropriate values, writing the rendered output to the destination file (overwriting any existing file with the same name).

## Key Differences from release-please

1. **Simplicity**: Self-contained, focused implementation without the complexity of the full release-please architecture
2. **Template-based Updates**: Using a consistent template syntax rather than language-specific patterns
3. **Single GitHub Action**: Combining the functionality into one action rather than separating the library and action
4. **Reduced Configuration**: Streamlined configuration options focused on common use cases

## Commit Type Mapping

The release-manager will use conventional commits to determine the type of version bump:

1. **Major Version Bump** (breaking changes):
   - `feat!`: Feature with breaking change marker
   - `fix!`: Fix with breaking change marker
   - Any commit with `BREAKING CHANGE:` in the body
   - Any commit type with a `!` suffix

2. **Minor Version Bump** (new features):
   - `feat`: New features without breaking changes

3. **Patch Version Bump** (bug fixes and non-breaking changes):
   - `fix`: Bug fixes
   - `perf`: Performance improvements
   - `refactor`: Code refactoring without functional changes

4. **No Version Bump** (excluded from bump calculation but included in changelog):
   - `docs`: Documentation changes
   - `style`: Code style changes (formatting, etc.)
   - `test`: Adding or modifying tests
   - `ci`: Changes to CI configuration files and scripts
   - `build`: Changes to build system or dependencies

5. **Excluded from Changelog**:
   - `chore`: Routine tasks and maintenance
   - Any commit with scope `no-release`

### Behaviour change for pre-1.0 releases:

Pre 1.0 releases will have different bump rules:

   - For pre-1.0 releases, use minor bumps
   - For pre-1.0 minor releases, use patch bumps

In order to make a 1.0 release, you must manually set the version to 1.0.0.

## Configuration Format

The release-manager will accept a JSON configuration file (`.release-manager.json`) with the following structure (and default values):

```json
{
  "mergeBranch": "main",               // Branch to analyze commits into
  "stagingBranch": "staging",          // Branch to create our staging PR on
  "releaseBranch": "release",          // Branch to merge our staging PR into
  "pullRequestTitle": "chore: release {version}", // PR title template
  "pullRequestHeader": "Release PR",      // Header for PR description
  "templateFiles": [                     // Files containing template markers
    "package.tpl.json"
  ],
  "versionFiles": [                       // Files containing inline version templates
    "src/version.go"
  ],
  "changelogSections": [                   // Custom ordering of changelog sections
    {"type": "feat", "section": "Features", "hidden": false},
    {"type": "fix", "section": "Bug Fixes", "hidden": false},
    {"type": "perf", "section": "Performance Improvements", "hidden": false}
  ],
  "changelogPath": "CHANGELOG.md",        // Path to changelog file
  "versionTagPrefix": true,              // Whether to prefix version tags with 'v' (true) or not (false)
  "tagLatest": true,                     // Whether to also tag the release as 'latest'
  "tagMajor": false,                     // Whether to also tag with major version only (e.g., v1)
  "tagMinor": false                      // Whether to also tag with major.minor version (e.g., v1.2)
}
```

## GitHub Action Input Parameters

The GitHub Action will accept the following input parameters:

```yaml
inputs:
  token:
    description: 'GitHub token with permissions to create branches and PRs'
    required: true
    default: '${{ github.token }}'
  
  config-file:
    description: 'Path to release-manager config file'
    required: false
    default: '.release-manager.json'
```

## Changelog Format

The changelog will be generated with the following format:

```markdown
# Changelog

## [1.2.0](https://github.com/owner/repo/compare/v1.1.0...v1.2.0) (2025-04-17)

### Features

* **scope:** add new feature ([commit hash](https://github.com/owner/repo/commit/hash)) ([#PR-number](https://github.com/owner/repo/pull/PR-number))

### Bug Fixes

* **scope:** fix important bug ([commit hash](https://github.com/owner/repo/commit/hash))

### Performance Improvements

* **scope:** improve performance of X ([commit hash](https://github.com/owner/repo/commit/hash))
```

Each entry will include:
- Commit type and scope (if available)
- Commit message
- Commit hash with link to the commit
- PR number with link (if available in commit message or by API lookup)

## PR Management

1. **Initial Release PR**:
   - Created with title format: `chore: release {version}`
   - Body includes:
     - Header section
     - Full generated changelog
     - List of files changed
   - Labels: `release` and other configurable labels

2. **Existing PR Handling**:
   - If a release PR already exists, it will be updated with new changes
   - If the version bump type changes (e.g., from minor to major), the PR title will be updated

3. **Merging Behavior**:
   - When merged, the action will:
     - Create a new tag with the version
     - It is up to a separate process to create the release

## Testing Strategy

1. **Unit Tests**:
   - Test template parsing and rendering
   - Test semver calculation from commit types
   - Test file modification logic
   - Test changelog generation

2. **Integration Tests**:
   - Mock GitHub API responses
   - Test end-to-end workflow with sample repositories
   - Test various configuration options

3. **Fixture-based Testing**:
   - Create fixture files with templates
   - Verify correct template replacement
   - Test multi-line template handling

## Implementation Plan

1. # Release Manager

A GitHub Action for automating semantic versioning based on conventional commits. The action handles versioning, changelog generation, and release management. in a repository
   - Determine appropriate semver bump
   - Generate a changelog
   - Update version references in files using our template syntax
   - Create or update a pull request with the changes
   - Tag releases when PRs are merged
   - Utilize GitHub API to achieve these tasks

2. Ensure the action works in a similar workflow pattern to release-please-action but with simplified configuration

## Debugging and Output Variables

### Debug Output

The release-manager will provide detailed debugging information in collapsible sections to avoid cluttering the UI while making the information available for inspection when needed:

1. **Commit Analysis**:
   - List of all commits being analyzed
   - Parsed commit information (type, scope, message)
   - Whether each commit is included or excluded from version calculation
   - Determined bump type for each commit

2. **Version Detection**:
   - Current version detection process
   - Existing tags discovered
   - Base version being used for calculations

3. **Version Bump Determination**:
   - Aggregate bump type calculation
   - Application of pre-1.0 rules if relevant
   - Final version bump decision (major, minor, patch, or none)
   - New version calculation

4. **Template Processing**:
   - Files being processed
   - Templates found
   - Rendered outputs

5. **PR Management**:
   - Branch creation/verification
   - PR creation or update process
   - Changes included in the PR

6. **Release Tagging**:
   - Tag creation process
   - Verification of tag existence
   - Optional tagging with 'v' prefix based on configuration
   - Optional additional tagging of 'latest', major version only (v1), and major.minor (v1.2) references

### Action Output Variables

The GitHub Action will expose the following output variables for use in subsequent workflow steps:

```yaml
outputs:
  run_type:
    description: 'Type of run that occurred ("pr" or "release")'
  is_pr_run:
    description: 'Boolean indicating if this was a PR creation run (true/false)'
  is_release_run:
    description: 'Boolean indicating if this was a release tagging run (true/false)'
  pr_number:
    description: 'PR number if a PR was created or updated'
  pr_url:
    description: 'URL of the PR if a PR was created or updated'
  pr_status:
    description: 'Status of the PR (open, closed) if a PR was created or updated'
  release_tag:
    description: 'Release tag if a release was tagged'
  additional_tags:
    description: 'Comma-separated list of additional tags created (latest, major, major.minor)'
  release_commit_sha:
    description: 'Commit SHA that was tagged for the release'
  previous_version:
    description: 'Previous version before the update'
  new_version:
    description: 'New version after the update'
  previous_major:
    description: 'Major version number from previous version'
  previous_minor:
    description: 'Minor version number from previous version'
  previous_patch:
    description: 'Patch version number from previous version'
  new_major:
    description: 'Major version number from new version'
  new_minor:
    description: 'Minor version number from new version'
  new_patch:
    description: 'Patch version number from new version'
  bump_type:
    description: 'Type of bump performed ("major", "minor", "patch", or "none")'
```

These output variables will be available to use in subsequent workflow steps, allowing for additional automation based on the results of the release-manager run.

## Reference

Based on our existing knowledge of release-please with Go projects:
- The current system uses specific version updaters for different languages
- For Go, it looks for patterns like `const Version = "X.Y.Z"` 
- Our system will be language-agnostic using the template-based approach
- We currently use annotations and "generic" type configurations in release-please
