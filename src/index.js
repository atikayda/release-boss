const core = require('@actions/core');
const github = require('@actions/github');
const semver = require('semver');
const { getConfig, validateConfig } = require('./utils/config');
const { detectReleasePR } = require('./github/detectReleasePR');
const { findBumpCommandsInPR, applyBumpCommand } = require('./github/findBumpCommands');

const { analyzeCommits, determineVersionBump } = require('./core/commitAnalyzer');
const { generateChangelog } = require('./core/changelogGenerator');
const { processVersionFiles, processTemplateFiles } = require('./core/templateProcessor');
const { createOrUpdatePR, tagRelease } = require('./github/prManager');

/**
 * Create a collapsible group in GitHub Actions log output
 * @param {string} title - Title of the group
 */
function startGroup(title) {
  core.info(`::group::${title}`);
}

/**
 * End a collapsible group in GitHub Actions log output
 */
function endGroup() {
  core.info('::endgroup::');
}

/**
 * Set an output variable for the GitHub Action
 * @param {string} name - Name of the output variable
 * @param {string} value - Value to set
 */
function setOutput(name, value) {
  core.setOutput(name, value);
  core.info(`Setting output ${name}: ${value}`);
}

/**
 * Helper function to extract version from staging branch name
 * @param {String} branchName - The branch name to extract version from
 * @param {String} stagingPrefix - The prefix for staging branches
 * @returns {String|null} - Extracted version or null if not found
 */
function extractVersionFromStagingBranch(branchName, stagingPrefix) {
  // Using a template literal for dynamic regex pattern
  const pattern = `^${stagingPrefix}-v?([0-9]+.[0-9]+.[0-9]+.*?)$`;
  const regex = new RegExp(pattern);
  const match = branchName.match(regex);
  return match ? match[1] : null;
}

async function run() {
  try {
    // Get inputs
    const token = core.getInput('token', { required: true });
    const configFilePath = core.getInput('config-file', { required: false });
    
    // Set up GitHub client
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    // Load and validate config
    const config = await getConfig(configFilePath);
    validateConfig(config);
    
    core.info('Configuration loaded and validated');
    
    // Check if this is a PR merge or a regular push
    startGroup('✨ Run Type Detection - What are we serving today? ✨');
    const isPRMerge = context.payload.pull_request && context.payload.action === 'closed' && context.payload.pull_request.merged;
    
    // Initialize these outside the if block so they're available in the wider scope
    let detectedPR = null;
    let isReleasePR = false;
    let branchVersion = null;
    
    if (isPRMerge) {
      core.info(`Detected PR merge event: PR #${context.payload.pull_request.number}`);
      core.info(`PR Title: ${context.payload.pull_request.title}`);
      core.info(`PR was merged: ${context.payload.pull_request.merged}`);
      
      // Get the head branch name - this is more reliable than the PR title
      const headBranch = context.payload.pull_request.head.ref;
      core.info(`PR was merged from branch: ${headBranch}`);
      
      // Check if this is a staging branch merge (our release PR pattern)
      if (headBranch.startsWith(`${config.stagingBranch}-`)) {
        core.info(`This PR is from a staging branch! That's our release pattern, honey! 💅`);
        isReleasePR = true;
        
        // Extract version from staging branch name
        branchVersion = extractVersionFromStagingBranch(headBranch, config.stagingBranch);
        
        if (branchVersion) {
          core.info(`Extracted version ${branchVersion} from staging branch name ${headBranch} 💃`);
        } else {
          core.info(`Couldn't extract version from branch name ${headBranch} - that's weird! 🤔`);
        }
      } else {
        core.info(`This PR is not from a staging branch, so it's not a release PR 🤷‍♀️`);
      }
    } else {
      core.info('Regular push event detected, not a PR merge');
      
      // Check if this might be a "stealth" PR merge (push to release branch from a staging branch)
      startGroup('👀 Detective work - Checking for stealth PR merges 👀');
      core.info('This looks like a regular push, but let me see if it\'s actually a stealth PR merge...');
      
      // Create octokit instance for GitHub API calls
      const token = core.getInput('token');
      const octokit = github.getOctokit(token);
      
      // Try to detect if this push is actually a merged PR
      detectedPR = await detectReleasePR(octokit, context, config);
      
      if (detectedPR) {
        core.info(`OMG! I found a stealth PR merge! PR #${detectedPR.number} from ${detectedPR.headBranch} 💅`);
        core.info(`PR Title: ${detectedPR.title}`);
        
        // Since we found a stealth PR merge, let's extract version from the branch name
        if (detectedPR.version) {
          branchVersion = detectedPR.version;
          isReleasePR = true;
          core.info(`Extracted version ${detectedPR.version} from branch name ${detectedPR.headBranch} 💃`);
        }
      } else {
        core.info('No stealth PR merge detected, just a regular push 🤷‍♀️');
      }
      
      endGroup();
    }
    endGroup();
    
    
    // Check for bump commands in PR comments
    let bumpCommandResult = { hasBumpCommand: false };
    // Use releasePrNumber as our variable name to avoid conflicts - we're so fashion-forward! 💅
    let releasePrNumber = null;
    
    if (isPRMerge) {
      // For a standard PR merge, get the PR number from the payload
      releasePrNumber = context.payload.pull_request.number;
    } else if (detectedPR) {
      // For a "stealth" PR merge detected from a push event
      releasePrNumber = detectedPR.number;
    }
    
    if (releasePrNumber) {
      startGroup('💋 Checking for bump commands in PR comments 💋');
      // Create octokit instance if we haven't already
      const authToken = core.getInput('token');
      const octokit = github.getOctokit(authToken);
      
      core.info(`Searching for bump commands in PR #${releasePrNumber} comments...`);
      bumpCommandResult = await findBumpCommandsInPR(octokit, context, releasePrNumber);
      
      if (bumpCommandResult.hasBumpCommand) {
        core.info(`💃 Found a /bump ${bumpCommandResult.bumpType} command from ${bumpCommandResult.commenter}! Time to level up! 💅`);
      } else {
        core.info('No bump commands found in the PR comments 🤷‍♀️');
      }
      endGroup();
    }
    
    // Process the PR if it's a release PR (from a staging branch) OR if we have a bump command
    // This is much simpler than trying to match PR titles! 💅
    if ((isPRMerge || detectedPR) && (isReleasePR || bumpCommandResult.hasBumpCommand)) {
      // This is a merged release PR - create a tag! 💅
      core.info('Detected merge of release PR - time to make it official! 💍');
      
      // We already extracted the version from the branch name earlier
      // No need to do it again! We're all about efficiency, honey! 💅
      
      // Just in case we don't have a branch version yet (unlikely), try to extract it from PR title
      if (!branchVersion && isPRMerge) {
        core.info('No branch version found, trying to extract from PR title as a last resort...');
        const titleVersion = extractVersionFromPRTitle(context.payload.pull_request.title, config.pullRequestTitle);
        if (titleVersion) {
          branchVersion = titleVersion;
          core.info(`Extracted version ${branchVersion} from PR title as a fallback 🤷‍♀️`);
        }
      }
      
      // Make sure we have a version to work with
      let version = branchVersion;
      
      if (!version) {
        // If we still don't have a version and we have a bump command, start from 0.0.0
        if (bumpCommandResult.hasBumpCommand) {
          version = '0.0.0';
          core.info(`No version found in branch or title, but we have a bump command! Starting from ${version} 💅`);
        } else {
          throw new Error("Couldn't determine version from branch name or PR title - I'm totally confused! 😵");
        }
      } else {
        core.info(`Using version ${version} extracted from branch name 💁‍♀️`);
      }
      
      // We've already checked for bump commands earlier, so let's use that result
      // No need to make another API call, we're data-efficient like that! 💅
      if (bumpCommandResult.hasBumpCommand) {
        core.info(`💋 Found that /bump ${bumpCommandResult.bumpType} command from ${bumpCommandResult.commenter || 'someone fabulous'}!`);
        
        // Apply the bump command to get our new fabulous version
        const originalVersion = version;
        version = applyBumpCommand(version, bumpCommandResult.bumpType);
        
        if (version !== originalVersion) {
          core.info(`💅 Applied ${bumpCommandResult.bumpType} bump to version: ${originalVersion} → ${version} - we're moving up in the world, honey!`);
        } else {
          core.info(`Version ${version} is already fierce enough for a ${bumpCommandResult.bumpType} version - no change needed 🤷‍♀️`);
        }
      }
      
      const previousVersion = version; // For now, track the same version
      
      // Skip the regular commit analysis flow since we already know what version we want!
      core.info(`\n💅 Skipping regular commit analysis since we already have our version: ${version}`);
      core.info('No need to analyze commits between branches when we already know what we want, honey! 💁‍♀️');
      
      // Set all the outputs directly
      setOutput('run_type', 'release');
      setOutput('is_pr_run', 'false');
      setOutput('is_release_run', 'true');
      setOutput('release_tag', `v${version}`);
      setOutput('previous_version', previousVersion);
      setOutput('new_version', version);
      setOutput('bump_type', bumpCommandResult.hasBumpCommand ? bumpCommandResult.bumpType : 'patch'); // Default to patch if no bump command
      
      // Set individual version components
      const [major, minor, patch] = version.split('.');
      setOutput('previous_major', major);
      setOutput('previous_minor', minor);
      setOutput('previous_patch', patch);
      setOutput('new_major', major);
      setOutput('new_minor', minor);
      setOutput('new_patch', patch);
      
      startGroup('🎉 Release Tagging - Crown that queen! 👑');
      try {
        // Get prefix based on configuration (default to 'v' if not specified)
        const useVPrefix = config.versionTagPrefix !== false;
        const prefix = useVPrefix ? 'v' : '';
        const releaseTag = `${prefix}${version}`;
        
        // Log tagging strategy
        core.info(`Tagging strategy:`);
        core.info(`  Version Tag Prefix: ${useVPrefix ? '"v"' : 'none'}`);
        core.info(`  Tag as 'latest': ${config.tagLatest !== false ? 'yes' : 'no'}`);
        core.info(`  Tag major version (${prefix}${version.split('.')[0]}): ${config.tagMajor === true ? 'yes' : 'no'}`);
        core.info(`  Tag major.minor version (${prefix}${version.split('.')[0]}.${version.split('.')[1]}): ${config.tagMinor === true ? 'yes' : 'no'}`);
        
        // Call tagRelease which now returns an object with sha and tags array
        const taggingResult = await tagRelease(octokit, context, version, config);
        const { sha: releaseCommitSha, tags: createdTags } = taggingResult;
        
        core.info(`Tagged release ${releaseTag} at commit ${releaseCommitSha.substring(0, 7)}`);
        
        if (createdTags.length > 1) {
          const additionalTags = createdTags.filter(tag => tag !== releaseTag);
          core.info(`Created/updated additional tags: ${additionalTags.join(', ')}`);
        }
        
        // Set output variables for release tagging
        setOutput('release_tag', releaseTag);
        setOutput('release_commit_sha', releaseCommitSha);
        setOutput('additional_tags', createdTags.join(','));
        setOutput('run_type', 'release');
        setOutput('is_pr_run', 'false');
        setOutput('is_release_run', 'true');
      } catch (error) {
        core.error(`Error creating tag: ${error.message}`);
        throw error;
      }
      endGroup();
      
      return;
    }
    
    // Analyze commits and determine version bump
    startGroup('🔍 Commit Analysis - Reading the room, hunty! 🙌');
    let commits;
    try {
      commits = await analyzeCommits(octokit, context, config);
      core.info(`Found ${commits.length} commits to analyze - let's see what you've been working on, babe! 👁‍🗨️`);
      
      // Detailed commit information
      if (commits.length > 0) {
        core.info('\nCommit details:');
        commits.forEach((commit, index) => {
          core.info(`\nCommit #${index + 1}:`);
          core.info(`  Hash: ${commit.hash}`);
          core.info(`  Message: ${commit.message.split('\n')[0]}${commit.message.split('\n').length > 1 ? ' ...' : ''}`);
          core.info(`  Type: ${commit.parsed.type || 'unknown'}`);
          core.info(`  Scope: ${commit.parsed.scope || 'none'}`);
          core.info(`  Breaking Changes: ${(commit.parsed.notes || []).some(note => note.title === 'BREAKING CHANGE') ? 'Yes' : 'No'}`);
          core.info(`  Bump Type: ${commit.bumpType || 'none'}`);
          core.info(`  Excluded: ${commit.excluded ? 'Yes' : 'No'}`);
        });
      } else {
        core.info('No commits found to analyze');
      }
    } catch (error) {
      core.error(`Error analyzing commits: ${error.message}`);
      throw error;
    }
    endGroup();
    
    startGroup('💎 Version Bump Determination - Time to level up! 💪');
    let bumpType, newVersion, currentVersion;
    try {
      const result = await determineVersionBump(commits, octokit, context, config);
      ({ bumpType, newVersion, currentVersion } = result);
      
      core.info(`Current version: ${currentVersion} - that's so last season! 👠`); 
      core.info(`Bump type: ${bumpType || 'none'} ${bumpType ? bumpType === 'major' ? '- MAJOR glow-up incoming! 🙌👑' : bumpType === 'minor' ? '- Fresh new lewk! 💄' : '- Just a touch-up, darling 💅' : '- Keeping it subtle today, honey 🙄'}`);
      
      if (bumpType) {
        core.info(`New version: ${newVersion} - looking FABULOUS, darling! ✨💃`);
        core.info(`Version components: Major=${result.major}, Minor=${result.minor}, Patch=${result.patch}`);
        
        if (currentVersion && semver.lt(currentVersion, '1.0.0')) {
          core.info('\nApplying pre-1.0 version bump rules:');
          core.info(`  - Major changes become minor bumps`);
          core.info(`  - Minor changes become patch bumps`);
        }
      } else {
        core.info('No version bump needed based on commits');
      }
    } catch (error) {
      core.error(`Error determining version bump: ${error.message}`);
      throw error;
    }
    endGroup();
    
    if (!bumpType) {
      core.info('No version bump needed');
      
      // Set output variables even when no bump is needed
      setOutput('run_type', 'none');
      setOutput('is_pr_run', 'false');
      setOutput('is_release_run', 'false');
      setOutput('previous_version', currentVersion);
      setOutput('new_version', currentVersion);
      setOutput('bump_type', 'none');
      
      const [major, minor, patch] = currentVersion.split('.');
      setOutput('previous_major', major);
      setOutput('previous_minor', minor);
      setOutput('previous_patch', patch);
      setOutput('new_major', major);
      setOutput('new_minor', minor);
      setOutput('new_patch', patch);
      
      return;
    }
    
    core.info(`Determined version bump: ${currentVersion} → ${newVersion} (${bumpType})`);
    
    // Set output variables for version information
    setOutput('previous_version', currentVersion);
    setOutput('new_version', newVersion);
    setOutput('bump_type', bumpType);
    
    // Set individual version components
    const [prevMajor, prevMinor, prevPatch] = currentVersion.split('.');
    const [newMajor, newMinor, newPatch] = newVersion.split('.');
    setOutput('previous_major', prevMajor);
    setOutput('previous_minor', prevMinor);
    setOutput('previous_patch', prevPatch);
    setOutput('new_major', newMajor);
    setOutput('new_minor', newMinor);
    setOutput('new_patch', newPatch);
    
    // Generate changelog
    startGroup('📝 Changelog Generation - Spilling the tea! 🍵✨');
    let changelog;
    try {
      changelog = await generateChangelog(commits, newVersion, currentVersion, octokit, context, config);
      core.info('Changelog generated successfully');
      core.info('\nPreview of changelog:');
      core.info('============================');
      core.info(changelog.length > 500 ? changelog.substring(0, 500) + '...' : changelog);
      core.info('============================');
    } catch (error) {
      core.error(`Error generating changelog: ${error.message}`);
      throw error;
    }
    endGroup();
    
    // Process version and template files
    const updatedFiles = [];
    
    startGroup('✨ Template Processing - Makeover time! 💅');
    try {
      if (config.versionFiles && config.versionFiles.length > 0) {
        core.info(`Processing ${config.versionFiles.length} version files:`);
        config.versionFiles.forEach(file => core.info(`  - ${file}`));
        
        const processedVersionFiles = await processVersionFiles(config.versionFiles, newVersion, config);
        core.info(`\nSuccessfully processed ${processedVersionFiles.length} version files:`);
        processedVersionFiles.forEach(file => core.info(`  - ${file}`));
        updatedFiles.push(...processedVersionFiles);
      } else {
        core.info('No version files to process');
      }
      
      if (config.templateFiles && config.templateFiles.length > 0) {
        core.info(`\nProcessing ${config.templateFiles.length} template files:`);
        config.templateFiles.forEach(file => core.info(`  - ${file}`));
        
        const generatedTemplateFiles = await processTemplateFiles(config.templateFiles, newVersion, config);
        core.info(`\nSuccessfully generated ${generatedTemplateFiles.length} output files:`);
        generatedTemplateFiles.forEach(file => core.info(`  - ${file}`));
        updatedFiles.push(...generatedTemplateFiles);
      } else {
        core.info('No template files to process');
      }
    } catch (error) {
      core.error(`Error processing templates: ${error.message}`);
      throw error;
    }
    endGroup();
    
    core.info(`Processed ${updatedFiles.length} files with new version information`);
    
    // Create or update PR
    startGroup('💋 Pull Request Management - Serving lewks! 💃');
    let prNumber, prUrl, prStatus;
    try {
      core.info(`Creating or updating PR for version ${newVersion} - time to strut our stuff! 👌👑`);
      
      if (updatedFiles.length > 0) {
        core.info('\nFiles to be committed to PR:');
        updatedFiles.forEach(file => core.info(`  - ${file}`));
      } else {
        core.info('No files to commit to PR, only changelog will be updated');
      }
      
      // Try to verify if there's an existing PR first to track status changes
      let existingPrState = null;
      if (context.payload.pull_request && context.payload.pull_request.number) {
        // This is running in the context of a PR
        const existingPrNumber = context.payload.pull_request.number;
        try {
          const { data: pr } = await octokit.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: existingPrNumber
          });
          existingPrState = pr.state;
          core.info(`Found existing PR #${existingPrNumber} in state: ${existingPrState}`);
        } catch (e) {
          core.warning(`Couldn't get existing PR #${existingPrNumber} state: ${e.message}`);
        }
      }
      
      const result = await createOrUpdatePR(octokit, context, newVersion, changelog, config, updatedFiles);
      ({ prNumber, prUrl, prStatus } = result);
      
      if (prNumber) {
        core.info(`PR #${prNumber} status: ${prStatus || 'unknown'}`);
        
        // Verify PR is still open
        try {
          const { data: pr } = await octokit.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber
          });
          
          if (pr.state === 'open') {
            core.info(`Successfully created/updated PR #${prNumber}: ${prUrl}`);
            prStatus = 'open';
          } else if (pr.state === 'closed') {
            core.warning(`PR #${prNumber} was closed unexpectedly - this may indicate staging branch has no differences from target`);
            prStatus = 'closed';
            
            // Check branch existence to provide better diagnostics
            try {
              await octokit.rest.repos.getBranch({
                owner: context.repo.owner,
                repo: context.repo.repo,
                branch: `${config.stagingBranch}-v${newVersion}`
              });
              core.info(`Staging branch ${config.stagingBranch}-v${newVersion} still exists - this confirms PR was closed due to lack of changes`);
            } catch (e) {
              core.warning(`Staging branch ${config.stagingBranch}-v${newVersion} seems to be gone - this may indicate other issues`);
            }
          }
        } catch (e) {
          core.warning(`Couldn't verify PR #${prNumber} status: ${e.message}`);
        }
      } else {
        core.warning('No PR number returned from createOrUpdatePR function');
      }
      
      // If PR went from open to closed, this is a significant event worth logging
      if (existingPrState === 'open' && prStatus === 'closed') {
        core.warning(`PR state changed from 'open' to 'closed' during this run. This usually happens when there are no changes between branches.`);
      }
    } catch (error) {
      core.error(`Error creating/updating PR: ${error.message}`);
      throw error;
    }
    endGroup();
    
    // Set output variables for PR information
    setOutput('run_type', 'pr');
    setOutput('is_pr_run', 'true');
    setOutput('is_release_run', 'false');
    setOutput('pr_number', prNumber ? prNumber.toString() : '');
    setOutput('pr_url', prUrl || '');
    setOutput('pr_status', prStatus || '');
    
    core.info(`Release PR management complete. PR #${prNumber} status: ${prStatus || 'unknown'}`);
    
    // Provide clearer messaging based on PR status
    if (prStatus === 'closed') {
      core.warning(`⚠️ The PR was closed. This usually happens when there are no changes between the staging and release branches.`);
      core.warning(`   Verify if all expected changes are included and if the PR needs to be manually reopened.`);
    } else if (prStatus === 'open') {
      core.info('✅ Release PR successfully created or updated');
    }
  
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}
/**
 * Extracts version from PR title - now with extra fabulous support for emojis and fancy formatting! 💅
 * @param {String} title - PR title 
 * @param {String} template - PR title template with {version} placeholder
 * @returns {String} Extracted version number or null if not found
 */
function extractVersionFromPRTitle(title, template) {
  // First escape regex special characters in the template
  const escapedTemplate = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Replace the escaped {version} with a semver capture group
  const pattern = escapedTemplate.replace(/\{version\}/g, '([0-9]+\\.[0-9]+\\.[0-9]+(?:-[\\w.-]+)?)');
  const regex = new RegExp(pattern);
  
  // Try to match and extract the version
  const match = title.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Super simple fallback - just in case all else fails
  try {
    console.log(`Trying fallback method for version extraction - regex didn't match! 😱`);
    const prefix = template.replace('{version}', '');
    const extracted = title.substring(title.indexOf(prefix) + prefix.length).trim();
    
    // Quick sanity check to make sure it looks like a version
    if (/^[0-9]+\.[0-9]+\.[0-9]+/.test(extracted)) {
      return extracted;
    } 
    return null;
  } catch (e) {
    console.log(`Oopsie! Couldn't extract version from PR title using any of our methods! 😱`);
    return null;
  }
}

run();
