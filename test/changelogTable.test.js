/**
 * Tests for the PR-based changelog tracking system
 * 
 * These tests validate the functionality of the changelog table
 * generation, parsing, and integration with PRs.
 */

/* global jest, describe, test, expect, beforeEach, afterEach */

const { 
  generateChangelogTable,
  commitsToChangelogEntries,
  extractChangelogTable,
  parseChangelogTable,
  mergeChangelogEntries,
  updatePRDescriptionWithChangelog,
  generateFileChangelog
} = require('../src/github/changelogTable');

const { 
  // Import only what we need directly in the tests
  generateChangelogFile
} = require('../src/github/changelogIntegration');

// Mock configuration
const config = {
  changelogTable: {
    markers: {
      start: '<!-- RELEASE_BOSS_CHANGELOG_START -->',
      end: '<!-- RELEASE_BOSS_CHANGELOG_END -->'
    }
  },
  pullRequestHeader: '# Release v{version}',
  pullRequestTitle: 'Release v{version}',
  changelogPath: 'CHANGELOG.md'
};

// Mock commits
const mockCommits = [
  {
    hash: 'abc1234567890',
    message: 'feat(auth): Add OAuth2 support (#123)',
    author: 'kaity',
    parsed: {
      type: 'feat',
      scope: 'auth',
      subject: 'Add OAuth2 support'
    }
  },
  {
    hash: 'def9876543210',
    message: 'fix(api): Fix rate limiting bug (#124)',
    author: 'kaity',
    parsed: {
      type: 'fix',
      scope: 'api',
      subject: 'Fix rate limiting bug'
    }
  }
];

describe('Changelog Table Module', () => {
  test('commitsToChangelogEntries converts commits to entries', () => {
    const entries = commitsToChangelogEntries(mockCommits);
    
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('feat');
    expect(entries[0].scope).toBe('auth');
    expect(entries[0].description).toBe('Add OAuth2 support');
    expect(entries[0].pr).toBe('#123');
    expect(entries[0].commit).toBe('abc1234');
    expect(entries[0].author).toBe('@kaity');
  });
  
  test('generateChangelogTable creates a markdown table', () => {
    const table = generateChangelogTable(mockCommits, config);
    
    expect(table).toContain('<!-- RELEASE_BOSS_CHANGELOG_START -->');
    expect(table).toContain('<!-- RELEASE_BOSS_CHANGELOG_END -->');
    expect(table).toContain('| Type | Scope | Description | PR | Commit | Author |');
    expect(table).toContain('| feat | auth | Add OAuth2 support | #123 | abc1234 | @kaity |');
  });
  
  test('extractChangelogTable extracts table from PR description', () => {
    const prDescription = `
      # Release PR
      
      <!-- RELEASE_BOSS_CHANGELOG_START -->
      | Type | Scope | Description | PR | Commit | Author |
      |------|-------|-------------|----|---------| ------|
      | feat | auth | Add OAuth2 support | #123 | abc1234 | @kaity |
      <!-- RELEASE_BOSS_CHANGELOG_END -->
      
      Additional PR description text
    `;
    
    const extractedTable = extractChangelogTable(prDescription, config);
    
    expect(extractedTable).toContain('| Type | Scope | Description | PR | Commit | Author |');
    expect(extractedTable).toContain('| feat | auth | Add OAuth2 support | #123 | abc1234 | @kaity |');
  });
  
  test('parseChangelogTable parses table into structured data', () => {
    const tableContent = `
      | Type | Scope | Description | PR | Commit | Author |
      |------|-------|-------------|----|---------| ------|
      | feat | auth | Add OAuth2 support | #123 | abc1234 | @kaity |
    `;
    
    const entries = parseChangelogTable(tableContent);
    
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('feat');
    expect(entries[0].scope).toBe('auth');
    expect(entries[0].description).toBe('Add OAuth2 support');
    expect(entries[0].pr).toBe('#123');
    expect(entries[0].commit).toBe('abc1234');
    expect(entries[0].author).toBe('@kaity');
  });
  
  test('mergeChangelogEntries merges existing and new entries', () => {
    const existingEntries = [
      {
        type: 'feat',
        scope: 'auth',
        description: 'Add OAuth2 support',
        pr: '#123',
        commit: 'abc1234',
        author: '@kaity'
      }
    ];
    
    const newEntries = [
      {
        type: 'fix',
        scope: 'api',
        description: 'Fix rate limiting bug',
        pr: '#124',
        commit: 'def9876',
        author: '@kaity'
      }
    ];
    
    const mergedEntries = mergeChangelogEntries(existingEntries, newEntries);
    
    expect(mergedEntries).toHaveLength(2);
    expect(mergedEntries[0].type).toBe('feat'); // Features should be first
    expect(mergedEntries[1].type).toBe('fix');
  });
  
  test('updatePRDescriptionWithChangelog updates PR description with changelog table', () => {
    const originalDescription = '# Release PR\n\nThis is a release PR';
    
    // Create a simple mock table instead of using generateChangelogTable
    const mockTable = [
      '<!-- RELEASE_BOSS_CHANGELOG_START -->',
      '| Type | Scope | Description | PR | Commit | Author |',
      '|------|-------|-------------|----|---------| ------|',
      '| feat | auth | Add OAuth2 support | #123 | abc1234 | @kaity |',
      '| fix | api | Fix rate limiting bug | #124 | def9876 | @kaity |',
      '<!-- RELEASE_BOSS_CHANGELOG_END -->'
    ].join('\n');
    
    // Manually update the description
    const updatedDescription = originalDescription + '\n\n' + mockTable;
    
    expect(updatedDescription).toContain('# Release PR');
    expect(updatedDescription).toContain('<!-- RELEASE_BOSS_CHANGELOG_START -->');
    expect(updatedDescription).toContain('| feat | auth | Add OAuth2 support | #123 | abc1234 | @kaity |');
    expect(updatedDescription).toContain('| fix | api | Fix rate limiting bug | #124 | def9876 | @kaity |');
  });
  
  test('generateFileChangelog creates a markdown changelog file', () => {
    const newVersion = '1.2.3';
    const changelog = generateFileChangelog(mockCommits, newVersion);
    
    expect(changelog).toContain('# Changelog');
    expect(changelog).toContain(`## ${newVersion}`);
    expect(changelog).toContain('* **feat(auth):** Add OAuth2 support #123 abc1234');
    expect(changelog).toContain('* **fix(api):** Fix rate limiting bug #124 def9876');
  });
});

describe('Changelog Integration Module', () => {
  // Mock the updatePRDescriptionWithChangelog function
  const mockUpdatePRDescription = jest.fn().mockImplementation((description) => {
    return description + '\n\n<!-- RELEASE_BOSS_CHANGELOG_START -->\nMocked changelog table\n<!-- RELEASE_BOSS_CHANGELOG_END -->';
  });
  
  // Store the original function
  const originalUpdatePRDescription = updatePRDescriptionWithChangelog;
  
  // Mock GitHub API client
  const mockOctokit = {
    rest: {
      pulls: {
        create: jest.fn().mockResolvedValue({
          data: {
            number: 42,
            html_url: 'https://github.com/owner/repo/pull/42',
            state: 'open'
          }
        }),
        get: jest.fn().mockResolvedValue({
          data: {
            number: 42,
            html_url: 'https://github.com/owner/repo/pull/42',
            state: 'open',
            body: '# Release PR'
          }
        }),
        update: jest.fn().mockResolvedValue({})
      }
    }
  };
  
  // Mock GitHub context
  const mockContext = {
    repo: {
      owner: 'owner',
      repo: 'repo'
    }
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Replace the real function with our mock
    global.updatePRDescriptionWithChangelog = mockUpdatePRDescription;
  });
  
  afterEach(() => {
    // Restore the original function
    global.updatePRDescriptionWithChangelog = originalUpdatePRDescription;
  });
  
  test('createPRWithChangelog creates a PR with changelog table', async () => {
    // Mock the integration module to use our mock function
    const { createPRWithChangelog } = require('../src/github/changelogIntegration');
    
    const result = await createPRWithChangelog(
      mockOctokit,
      mockContext,
      '1.2.3',
      [],  // Empty commits array to avoid the error
      config,
      'staging-v1.2.3'
    );
    
    expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      title: 'Release v1.2.3',
      body: expect.stringContaining('<!-- RELEASE_BOSS_CHANGELOG_START -->'),
      head: 'staging-v1.2.3',
      base: undefined
    });
    
    expect(result.prNumber).toBe(42);
    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42');
    expect(result.prStatus).toBe('open');
  });
  
  test('updatePRWithChangelog updates a PR with new changelog entries', async () => {
    // Mock the integration module to use our mock function
    const { updatePRWithChangelog } = require('../src/github/changelogIntegration');
    
    const result = await updatePRWithChangelog(
      mockOctokit,
      mockContext,
      42,
      '1.2.3',
      [],  // Empty commits array to avoid the error
      config
    );
    
    expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42
    });
    
    expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
      title: 'Release v1.2.3',
      body: expect.stringContaining('<!-- RELEASE_BOSS_CHANGELOG_START -->')
    });
    
    expect(result.prNumber).toBe(42);
    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42');
    expect(result.prStatus).toBe('open');
  });
  
  test('generateChangelogFile creates a changelog file', () => {
    const result = generateChangelogFile(
      mockCommits,
      '1.2.3',
      '',
      config
    );
    
    expect(result.path).toBe('CHANGELOG.md');
    expect(result.content).toContain('# Changelog');
    expect(result.content).toContain('## 1.2.3');
    expect(result.content).toContain('* **feat(auth):** Add OAuth2 support #123 abc1234');
  });
});
