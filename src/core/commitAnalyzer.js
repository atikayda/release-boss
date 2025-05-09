const semver = require('semver');
const conventionalCommitsParser = require('conventional-commits-parser');

/**
 * Convert commit objects to changelog entry objects
 * @param {Array} commits - Array of parsed commits
 * @returns {Array} - Array of changelog entries
 */
function commitsToChangelogEntries(commits) {
  return commits.map(commit => {
    // Extract PR number from commit message if available
    const prMatch = commit.message.match(/#(\d+)/);
    const prNumber = prMatch ? prMatch[1] : '';
    const prRef = prNumber ? `#${prNumber}` : '';
    
    return {
      type: commit.parsed.type || 'other',
      scope: commit.parsed.scope || '',
      description: commit.parsed.subject || commit.message.split('\n')[0],
      pr: prRef,
      commit: commit.hash.substring(0, 7),
      author: commit.author ? `@${commit.author}` : ''
    };
  });
}

/**
 * Commit types that trigger a minor version bump (new features)
 */
const MINOR_BUMP_TYPES = ['feat'];

/**
 * Commit types that trigger a patch version bump (bug fixes and non-breaking changes)
 */
const PATCH_BUMP_TYPES = ['fix', 'perf', 'refactor'];

/**
 * Commit types that are included in the changelog but don't trigger a version bump
 */
const NO_BUMP_TYPES = ['docs', 'style', 'test', 'ci', 'build'];

/**
 * Commit types that are excluded from the changelog and don't trigger a version bump
 */
const EXCLUDED_TYPES = ['chore'];

/**
 * Analyze commits between two references (branches, commits, etc.)
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Object} config - Release Boss configuration
 * @param {String} baseRef - Base reference (default: config.releaseBranch)
 * @param {String} headRef - Head reference (default: config.mergeBranch)
 * @returns {Array} - Array of parsed and analyzed commits
 */
async function analyzeCommits(octokit, context, config, baseRef, headRef) {
  const { owner, repo } = context.repo;
  
  // Use provided refs or fall back to config values
  const base = baseRef || config.releaseBranch;
  const head = headRef || config.mergeBranch;
  
  console.log(`Analyzing commits between ${base} and ${head}...`);
  
  // Get commits between base and head references
  const compareResponse = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base,
    head
  });
  
  if (!compareResponse.data.commits || compareResponse.data.commits.length === 0) {
    console.log('No commits found to analyze');
    return [];
  }
  
  console.log(`Found ${compareResponse.data.commits.length} commits to analyze`);
  
  // Parse commits using conventional-commits-parser
  const parsedCommits = compareResponse.data.commits.map(commit => {
    const parsed = conventionalCommitsParser.sync(commit.commit.message, {
      headerPattern: /^(\w*)(?:\(([\w\$\.\-\*\s]*)\))?\: (.*)$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
      noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
      revertPattern: /^revert:\s([\s\S]*?)/,
      revertCorrespondence: ['header'],
      issuePrefixes: ['#']
    });
    
    // Determine the bump type for this commit
    let bumpType = getBumpTypeForCommit(parsed);
    
    // Determine if this commit should be excluded from changelog
    const excluded = isExcludedFromChangelog(parsed);
    
    return {
      hash: commit.sha,
      message: commit.commit.message,
      parsed,
      url: commit.html_url,
      author: commit.author ? commit.author.login : null,
      date: commit.commit.author.date,
      bumpType,
      excluded
    };
  });
  
  // Filter out the excluded commits
  const filteredCommits = parsedCommits.filter(commit => !commit.excluded);
  
  console.log(`${filteredCommits.length} commits will be included in analysis`);
  return filteredCommits;
}

/**
 * Determine the bump type for a single commit based on its type and content
 * @param {Object} parsedCommit - Parsed commit object from conventional-commits-parser
 * @returns {string|null} - 'major', 'minor', 'patch', or null for no bump
 */
function getBumpTypeForCommit(parsedCommit) {
  // First check for breaking changes which always trigger a major bump
  const hasBreakingChangeMarker = parsedCommit.type && parsedCommit.type.endsWith('!');
  const hasBreakingChangeNote = parsedCommit.notes && parsedCommit.notes.some(note => 
    note.title === 'BREAKING CHANGE' || note.title === 'BREAKING-CHANGE'
  );
  
  if (hasBreakingChangeMarker || hasBreakingChangeNote) {
    return 'major';
  }
  
  // Check for feature commits (minor bump)
  if (MINOR_BUMP_TYPES.includes(parsedCommit.type)) {
    return 'minor';
  }
  
  // Check for fix commits (patch bump)
  if (PATCH_BUMP_TYPES.includes(parsedCommit.type)) {
    return 'patch';
  }
  
  // Check for commits that don't trigger a bump but are included in changelog
  if (NO_BUMP_TYPES.includes(parsedCommit.type)) {
    return null;
  }
  
  // Default to no bump if the type doesn't match any category
  return null;
}

/**
 * Determine if a commit should be excluded from the changelog
 * @param {Object} parsedCommit - Parsed commit object from conventional-commits-parser
 * @returns {boolean} - True if the commit should be excluded
 */
function isExcludedFromChangelog(parsedCommit) {
  // Exclude commits with types in the excluded list
  if (EXCLUDED_TYPES.includes(parsedCommit.type)) {
    return true;
  }
  
  // Exclude commits with scope 'no-release'
  if (parsedCommit.scope === 'no-release') {
    return true;
  }
  
  return false;
}

/**
 * Determine the type of version bump based on analyzed commits
 * @param {Array} commits - Array of parsed and analyzed commits
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Object} config - Release Boss configuration
 * @returns {Object} - Bump type and new version information
 */
async function determineVersionBump(commits, octokit, context, config) {
  const { owner, repo } = context.repo;
  let currentVersion = '0.0.0';
  
  console.log('Determining current version from repository tags...');
  try {
    // First try to get tags in descending order
    const { data: tags } = await octokit.rest.repos.listTags({
      owner,
      repo,
      per_page: 10
    });
    
    if (tags && tags.length > 0) {
      // Filter tags that match semantic version format with optional 'v' prefix
      const versionTags = tags.filter(tag => {
        const version = tag.name.replace(/^v/, '');
        return semver.valid(version);
      });
      
      if (versionTags.length > 0) {
        // Sort by semver (descending)
        versionTags.sort((a, b) => {
          const versionA = a.name.replace(/^v/, '');
          const versionB = b.name.replace(/^v/, '');
          return semver.rcompare(versionA, versionB);
        });
        
        // Use the highest version
        currentVersion = versionTags[0].name.replace(/^v/, '');
        console.log(`Found ${versionTags.length} version tags. Latest tag: ${versionTags[0].name}`);
        console.log(`Using version: ${currentVersion}`);
      } else {
        console.log(`Found ${tags.length} tags, but none match semver format. Starting from 0.0.0`);
      }
    } else {
      // If no tags, fall back to releases
      console.log('No tags found, checking releases...');
      const latestRelease = await octokit.rest.repos.getLatestRelease({
        owner,
        repo
      });
      
      if (latestRelease.data.tag_name) {
        // Remove 'v' prefix if it exists
        currentVersion = latestRelease.data.tag_name.replace(/^v/, '');
        console.log(`Latest release version from GitHub Releases: ${currentVersion}`);
      } else {
        console.log('No releases found either, starting from 0.0.0');
      }
    }
  } catch (error) {
    // No releases or tags found, starting from 0.0.0
    console.log(`Error fetching version information: ${error.message}`);
    console.log('Starting from 0.0.0');
  }
  
  // Calculate the highest impact bump from all commits
  const bumpTypes = commits
    .filter(commit => commit.bumpType) // Only consider commits with a bump type
    .map(commit => commit.bumpType);
  
  // Determine the highest impact bump type
  let bumpType = null;
  
  if (bumpTypes.includes('major')) {
    bumpType = 'major';
  } else if (bumpTypes.includes('minor')) {
    bumpType = 'minor';
  } else if (bumpTypes.includes('patch')) {
    bumpType = 'patch';
  }
  
  console.log(`Determined bump type: ${bumpType || 'none'}`);
  
  // Override with explicit releaseAs from config if provided
  if (config.releaseAs && ['major', 'minor', 'patch'].includes(config.releaseAs)) {
    console.log(`Overriding bump type with config releaseAs: ${config.releaseAs}`);
    bumpType = config.releaseAs;
  }
  
  // No version bump needed
  if (!bumpType) {
    return { 
      bumpType: null, 
      newVersion: currentVersion, 
      currentVersion,
      major: semver.major(currentVersion),
      minor: semver.minor(currentVersion),
      patch: semver.patch(currentVersion)
    };
  }
  
  // Calculate new version based on bump type and pre-1.0 rules
  let newVersion = currentVersion;
  let newBumpType = bumpType;
  
  // Apply pre-1.0 version bump rules
  if (semver.lt(currentVersion, '1.0.0')) {
    if (bumpType === 'major') {
      // For pre-1.0, a breaking change results in a minor bump
      console.log('Pre-1.0 rule: Converting major bump to minor');
      newBumpType = 'minor';
    } else if (bumpType === 'minor') {
      // For pre-1.0, a feature results in a patch bump
      console.log('Pre-1.0 rule: Converting minor bump to patch');
      newBumpType = 'patch';
    }
  }
  
  // Increment version
  newVersion = semver.inc(currentVersion, newBumpType);
  console.log(`New version will be: ${newVersion}`);
  
  return { 
    bumpType, 
    newVersion, 
    currentVersion,
    major: semver.major(newVersion),
    minor: semver.minor(newVersion),
    patch: semver.patch(newVersion)
  };
}

/**
 * Find new commits since the last update
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} lastCommitSha - SHA of the last processed commit
 * @param {String} headRef - Reference to compare against (branch or commit)
 * @returns {Array} - Array of new commits
 */
async function findNewCommitsSince(octokit, context, lastCommitSha, headRef) {
  const { owner, repo } = context.repo;
  
  console.log(`Finding new commits since ${lastCommitSha.substring(0, 7)}...`);
  
  // Get commits between lastCommitSha and headRef
  const compareResponse = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: lastCommitSha,
    head: headRef
  });
  
  if (!compareResponse.data.commits || compareResponse.data.commits.length === 0) {
    console.log('No new commits found');
    return [];
  }
  
  console.log(`Found ${compareResponse.data.commits.length} new commits since ${lastCommitSha.substring(0, 7)} 💅`);
  return compareResponse.data.commits;
}

module.exports = {
  analyzeCommits,
  determineVersionBump,
  getBumpTypeForCommit, // Exported for testing
  isExcludedFromChangelog, // Exported for testing
  commitsToChangelogEntries, // Exported for changelog table generation
  findNewCommitsSince // Exported for PR updates
};
