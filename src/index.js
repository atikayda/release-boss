const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');
const semver = require('semver');

const { analyzeCommits, determineVersionBump } = require('./core/commitAnalyzer');
const { generateChangelog } = require('./core/changelogGenerator');
const { processVersionFiles, processTemplateFiles } = require('./core/templateProcessor');
const { createOrUpdatePR, tagRelease } = require('./github/prManager');
const { checkForBumpCommands, applyBumpCommand } = require('./github/commentAnalyzer');
const { getConfig, validateConfig } = require('./utils/config');

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
    
    if (isPRMerge) {
      core.info(`Detected PR merge event: PR #${context.payload.pull_request.number}`);
      core.info(`PR Title: ${context.payload.pull_request.title}`);
      core.info(`PR was merged: ${context.payload.pull_request.merged}`);
      core.info(`Expected PR title format: ${config.pullRequestTitle.replace('{version}', 'X.Y.Z')}`);
      
      // Convert our PR title template into a regex pattern by replacing {version} with a semver match
      // First escape all regex special chars in the template
      const escapedTemplate = config.pullRequestTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Then replace the escaped {version} with a semver capture group
      const titlePattern = escapedTemplate.replace(/\{version\}/g, '([0-9]+\.[0-9]+\.[0-9]+(?:-[\w.-]+)?)');
      
      // Create regex and test against PR title
      const titleRegex = new RegExp(titlePattern);
      const titleMatch = context.payload.pull_request.title.match(titleRegex);
      const isTitleMatch = !!titleMatch;
      
      if (isTitleMatch && titleMatch[1]) {
        core.info(`PR title matches our fabulous format! Extracted version: ${titleMatch[1]} 💅`);
      } else {
        core.info(`PR title doesn't match our template pattern 😱`);
      }
      core.info(`PR title matches expected format: ${isTitleMatch}`);
    } else {
      core.info('Regular push event detected, not a PR merge');
    }
    endGroup();
    
    // Helper function to extract version from staging branch name
    function extractVersionFromStagingBranch(branchName, stagingPrefix) {
      const regex = new RegExp(`^${stagingPrefix}-v?([0-9]+\.[0-9]+\.[0-9]+.*)$`);
      const match = branchName.match(regex);
      return match ? match[1] : null;
    }
    
    if (isPRMerge && isTitleMatch) {
      // This is a merged release PR - create a tag! 💅
      core.info('Detected merge of release PR - time to make it official! 💍');
      
      // First extract version from PR title as a fallback
      const titleVersion = extractVersionFromPRTitle(context.payload.pull_request.title, config.pullRequestTitle);
      
      // Then try to get version from the head branch name (this is more reliable)
      // The staging branch follows the pattern: {stagingBranch}-v{version}
      const headBranch = context.payload.pull_request.head.ref;
      core.info(`PR was merged from branch: ${headBranch}`);
      
      // Try to extract version from the staging branch name
      const branchVersion = extractVersionFromStagingBranch(headBranch, config.stagingBranch);
      
      // Use branch version if available, otherwise fall back to title version
      let version = branchVersion || titleVersion;
      if (branchVersion) {
        core.info(`Extracted version ${version} from staging branch name ${headBranch} 💁‍♀️`);
      } else if (titleVersion) {
        core.info(`Couldn't extract version from branch, using title version instead: ${version}`);
      } else {
        throw new Error("Couldn't determine version from PR title or branch name - I'm totally confused! 😵");
      }
      
      // Check for special bump commands in PR comments
      const bumpCommandResult = await checkForBumpCommands(octokit, context);
      
      if (bumpCommandResult.hasBumpCommand) {
        core.info(`💋 Found a bump command in the PR comments: /bump ${bumpCommandResult.bumpType}`);
        
        // Apply the bump command to get our new fabulous version
        const originalVersion = version;
        version = applyBumpCommand(version, bumpCommandResult.bumpType);
        
        if (version !== originalVersion) {
          core.info(`💅 Applied ${bumpCommandResult.bumpType} bump to version: ${originalVersion} → ${version}`);
        } else {
          core.info(`Version already at appropriate ${bumpCommandResult.bumpType} level (${version}), no change needed`);
        }
      }
      
      const previousVersion = version; // For now, track the same version
      
      setOutput('run_type', 'release');
      setOutput('is_pr_run', 'false');
      setOutput('is_release_run', 'true');
      setOutput('release_tag', `v${version}`);
      setOutput('previous_version', previousVersion);
      setOutput('new_version', version);
      
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
  const pattern = escapedTemplate.replace(/\{version\}/g, '([0-9]+\.[0-9]+\.[0-9]+(?:-[\w.-]+)?)');
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
