# PR-Based Changelog Tracking

This document explains how Release Boss tracks changes in PR descriptions using a structured changelog table.

## Overview

The PR-based changelog tracking system allows Release Boss to maintain a structured changelog directly in the PR description. This approach has several advantages:

1. **Visibility**: Changes are immediately visible in the PR description
2. **Human Editable**: The table format is easy to read and edit manually
3. **Machine Readable**: The structured format allows for automated parsing
4. **Persistence**: Changes are preserved even when using squash merges

## How It Works

When Release Boss creates or updates a release PR, it:

1. Analyzes commits and extracts relevant information
2. Converts commit data into changelog entries
3. Generates a markdown table with the entries
4. Adds or updates the table in the PR description

The table is enclosed in special HTML comments that make it easy to identify and update:

```markdown
<!-- RELEASE_BOSS_CHANGELOG_START -->
| Type | Scope | Description | PR | Commit | Author |
|------|-------|-------------|----|---------| ------|
| feat | auth | Add OAuth2 support | #123 | abc1234 | @username |
| fix | api | Fix rate limiting bug | #124 | def5678 | @username |
<!-- RELEASE_BOSS_CHANGELOG_END -->
```

## Manual Editing

You can manually edit the changelog table in the PR description. Release Boss will preserve your edits when updating the PR, as long as:

1. The marker comments remain intact
2. The table structure remains valid (header row + separator row + data rows)

When new commits are added to the PR, Release Boss will:
- Keep existing entries you've edited
- Add new entries for new commits
- Update entries for existing commits if they've changed

## Configuration

The changelog table feature can be configured in your Release Boss config file:

```yaml
changelogTable:
  enabled: true
  markers:
    start: "<!-- RELEASE_BOSS_CHANGELOG_START -->"
    end: "<!-- RELEASE_BOSS_CHANGELOG_END -->"
  columns:
    - name: "Type"
      field: "type"
    - name: "Scope"
      field: "scope"
    - name: "Description"
      field: "description"
    - name: "PR"
      field: "pr"
    - name: "Commit"
      field: "commit"
    - name: "Author"
      field: "author"
```

## File-Based Changelog

Release Boss can still generate a file-based changelog alongside the PR-based tracking. The file-based changelog is generated from the same commit data but formatted as a traditional markdown list:

```markdown
# Changelog

## 1.2.3 (2025-05-09)

* **feat(auth):** Add OAuth2 support #123 abc1234
* **fix(api):** Fix rate limiting bug #124 def5678
```

## API Reference

The PR-based changelog tracking system provides several functions that can be used in your custom workflows:

### `generateChangelogTable(commits, config)`

Generates a markdown table with changelog entries from commits.

### `commitsToChangelogEntries(commits)`

Converts commit objects to changelog entry objects.

### `extractChangelogTable(description, config)`

Extracts the changelog table from a PR description.

### `parseChangelogTable(tableContent)`

Parses a markdown table into structured data.

### `mergeChangelogEntries(existingEntries, newEntries)`

Merges existing changelog entries with new ones.

### `updatePRDescriptionWithChangelog(description, commits, config)`

Updates a PR description with a changelog table.

### `generateFileChangelog(commits, newVersion, baseContent)`

Generates a file-based changelog from commits.

## Integration Example

Here's an example of how to use the PR-based changelog tracking system in your custom workflow:

```javascript
const { 
  updatePRDescriptionWithChangelog,
  generateFileChangelog
} = require('./github/changelogTable');

// Create a PR with changelog table
async function createPR(octokit, context, newVersion, commits, config) {
  const { owner, repo } = context.repo;
  
  // Generate PR title and body
  const title = `Release v${newVersion}`;
  const body = updatePRDescriptionWithChangelog('# Release PR', commits, config);
  
  // Create the PR
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: `staging-v${newVersion}`,
    base: 'main'
  });
  
  return pr;
}
```

## Best Practices

1. **Commit Message Format**: Use conventional commit format for best results
2. **PR Numbers**: Include PR numbers in commit messages (#123) for automatic linking
3. **Manual Edits**: Feel free to edit the changelog table manually for clarity
4. **Custom Fields**: Extend the table with custom columns if needed

Happy releasing! 💅✨
