# ✨ Release Boss - Project Scope ✨

## 💎 Overview

This project creates a fabulous, self-contained GitHub Action called "Release Boss" who provides a streamlined version of the functionality offered by release-please and similar tools. She's all about simplicity, flexibility, and adding a touch of sass to the release process! 💅

## 🌟 Core Features

Release Boss (she/her) handles the following tasks with style and sass:

1. **Smart Version Bumping** 📈
   - Analyzes conventional commits to determine version bumps (patch, minor, major)
   - Supports dynamic version bumps via PR comments with `/bump` commands
   - Applies special rules for pre-1.0 releases

2. **Gorgeous Changelog Generation** 📝
   - Creates beautifully formatted changelogs organized by commit type
   - Customizable section titles with emoji support
   - Links to commits and PRs for easy reference
   - Maintains a structured changelog table in PR descriptions
   - Supports both machine-readable and human-editable formats

3. **Flexible Version Updates** 🔄
   - Updates version references in files using inline templates
   - Processes whole-file templates for more complex updates
   - Preserves template markers for future updates

4. **Fabulous PR Management** 💋
   - Creates and updates release PRs with detailed information
   - Detects "stealth" PR merges that appear as regular pushes
   - Supports branch-based detection for release PRs
   - Automatically cleans up staging branches after PR merge or closure (configurable)

5. **Tagging & Release Management** 🏷️
   - Creates version tags when PRs are merged
   - Supports major, minor, and latest tag aliases
   - Configurable tag prefix options

## 💅 Version Update Mechanisms

### Inline Version Templates

Files can include template markers in the format:
```
// %%release-boss: const Version = 'v{{version}}'%%
```

Or multi-line templates:
```
/* %%release-boss:
const Version = 'v{{version}}'
const Major = '{{major}}'
const Minor = '{{minor}}'
const Patch = '{{patch}}'
%% */
```

The Release Boss will:
- Keep the template markers intact
- Replace the implementation with the rendered template
- Support variables like `{{version}}`, `{{major}}`, `{{minor}}`, and `{{patch}}`

### Whole-File Templates

For more complex files, you can use whole-file templates:
- The entire file is treated as a template
- Template variables are replaced throughout the file
- Output files can be specified in the configuration

### Line-based Search and Replace

For files where you can't add template markers (like third-party files or files managed by other tools):
- Specify a line to search for using `findLine`
- Provide a replacement template with `replaceLine`
- Release Boss finds the line containing the search text and replaces it with the template
- Perfect for updating version strings in files you can't modify with markers

## 👑 Configuration Options

Release Boss now supports both YAML and JSON configuration formats!

### YAML Configuration (Recommended)

Create a `.release-boss.yml` file with configuration like:

```yaml
# Branch Configuration
mergeBranch: main
stagingBranch: staging
releaseBranch: release

# PR Configuration
pullRequestTitle: "chore: release ✨ {version} ✨"
pullRequestHeader: "# 🎉 Release Time! 💃"

# Files to update
versionFiles:
  - src/version.js
templateFiles:
  - path: package.tpl.json
    output: package.json

# Changelog Configuration
changelogSections:
  - type: feat
    section: "✨ Fabulous New Features ✨"
    hidden: false
  - type: fix
    section: "🛠️ Bug Fixes & Polish 💅"
    hidden: false

changelogPath: CHANGELOG.md

# Tagging Configuration
versionTagPrefix: true
tagLatest: true
tagMajor: true
tagMinor: true
```

### JSON Configuration (Traditional)

For those who prefer JSON, create a `.release-boss.json` file instead.

## 💃 Commit Type Mapping

Release Boss uses her conventional commit analysis skills to determine version bumps:

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

4. **No Version Bump** (included in changelog but no version change):
   - `docs`: Documentation changes
   - `style`: Code style changes
   - `test`: Adding or modifying tests
   - `ci`: CI configuration changes
   - `build`: Build system changes

5. **Excluded from Changelog**:
   - `chore`: Routine tasks and maintenance
   - Any commit with scope `no-release`

### Special Rules for Pre-1.0 Releases

For pre-1.0 releases, we apply different bump rules:
- Major changes become minor bumps
- Minor changes become patch bumps

In order to make a 1.0 release, you must manually bump the version via a `/bump major` comment command in the merge PR.

## 🚀 GitHub Action Setup

The GitHub Action accepts these input parameters:

```yaml
inputs:
  token:
    description: 'GitHub token with permissions to create branches and PRs'
    required: true
    default: '${{ github.token }}'
  
  config-file:
    description: 'Path to Release Boss config file'
    required: false
    # No default - will auto-detect .release-boss.yml or .release-boss.json
```

## 🔄 Release Workflow Architecture

Release Boss follows a fabulous GitFlow-inspired approach that's both elegant and practical! 💁‍♀️

### GitFlow Branch Strategy

Unlike simpler tools that just create PRs from main → release, Release Boss takes a more sophisticated approach:

1. **Base Branch Selection**:
   - She starts with your release branch as the base (not main!) 💅
   - This ensures stability and continuity between releases
   - Preserves any release-specific configurations

2. **Staging Branch Creation**:
   - Creates a staging branch from the release branch
   - Format: `staging-v{version}` (e.g., `staging-v1.2.0`)
   - This becomes your preview environment for the release

3. **Feature Integration**:
   - Merges your main branch into the staging branch
   - Brings in all your new features and fixes
   - Handles merge conflicts gracefully during PR creation

4. **Post-Merge Processing**:
   - After merging main, she updates version files and changelog
   - Uses smart conflict avoidance by checking release branch content first
   - Ensures clean, conflict-free PRs

5. **PR & Release Flow**:
   - Creates a PR from staging → release for your review
   - When merged, automatically tags the release
   - Optionally updates major/minor/latest tag aliases

This approach gives you all the benefits of GitFlow without the complexity! 💖

## ✨ Recent Enhancements

1. **GitFlow-Based Release Process**:
   - Improved branch strategy for cleaner merges
   - Enhanced conflict avoidance in changelog and version files
   - Better alignment with enterprise release practices

2. **YAML Configuration Support**:
   - She now supports YAML configuration files
   - More GitHub-friendly with comment support
   - She automatically detects configuration format

3. **PR Comment Commands**:
   - Support for `/bump major` and `/bump minor` commands in PR comments
   - Allows users to override the calculated version bump

4. **Improved PR Detection**:
   - Enhanced detection of "stealth" PR merges
   - Better handling of emoji-filled PR titles
   - More flexible branch name pattern matching

5. **Code Cleanup**:
   - Removed unused functions and variables
   - Improved code organization and maintainability
   - Enhanced logging with playful messages

## 💕 Future Enhancements

Potential future improvements include:

1. **Enhanced Release Notes**:
   - More customization options for changelog formatting
   - Support for release note templates

2. **Additional Template Variables**:
   - Support for custom variables in templates
   - Date formatting options for changelogs

3. **Integration with Other GitHub Features**:
   - Automatic milestone management
   - Issue linking and tracking

4. **Advanced Configuration Options**:
   - Custom commit type mappings
   - More flexible PR title and body templates

## 💋 Dogfooding: Release Boss Uses Itself!

We believe in practicing what we preach, so Release Boss uses itself for its own releases! 💅 This self-referential fabulousness helps us:

1. **Validate Our Own Process**:
   - We experience the same workflow as our users
   - We catch issues before our users do
   - We continuously refine the experience

2. **Showcase Best Practices**:
   - Our own repository serves as a living example
   - Users can see real-world configuration in action
   - We demonstrate the power of conventional commits

3. **Maintain Language Agnosticism**:
   - Unlike release-please which uses language-specific updaters
   - We use our own template-based approach
   - This ensures we support any language or file format

Our repository includes a complete setup with GitHub Actions workflow, YAML configuration, and template files - all ready for you to explore and adapt for your own projects! 💃

## 💯 Testing Strategy

To ensure Release Boss works flawlessly and stays fabulous, we employ a comprehensive testing approach to keep her looking her best:

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
