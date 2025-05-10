const fs = require('fs').promises;
const yaml = require('js-yaml');

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  mergeBranch: 'main',
  stagingBranch: 'staging',
  releaseBranch: 'release',
  deleteStagingBranch: true,  // By default, we'll clean up staging branches after PR closure
  pullRequestTitle: 'chore: release {version}',
  pullRequestHeader: 'Release PR',
  templateFiles: [],
  versionFiles: [],
  changelogSections: [
    { type: 'feat', section: 'Features', hidden: false },
    { type: 'fix', section: 'Bug Fixes', hidden: false },
    { type: 'perf', section: 'Performance Improvements', hidden: false }
  ],
  changelogPath: 'CHANGELOG.md',
  // Changelog table configuration for PR-based tracking
  changelogTable: {
    enabled: true,
    // Table format options
    columns: [
      { name: "Type", field: "type" },
      { name: "Scope", field: "scope" },
      { name: "Description", field: "description" },
      { name: "PR", field: "pr" },
      { name: "Commit", field: "commit" },
      { name: "Author", field: "author" }
    ],
    // HTML comment markers to identify the changelog table
    markers: {
      start: "<!-- RELEASE_BOSS_CHANGELOG_START -->",
      end: "<!-- RELEASE_BOSS_CHANGELOG_END -->"
    },
    // Sorting options
    sorting: {
      enabled: true,
      order: ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'ci', 'build', 'chore']
    },
    // Filtering options
    filtering: {
      excludeTypes: ['chore'],  // Commit types to exclude from changelog table
      requireScope: false       // Whether to require a scope for all entries
    },
    // Placement options
    placement: {
      afterHeader: true,        // Place table after PR header
      beforeBody: false         // Place table before PR body
    }
  }
};

/**
 * Load and parse the configuration file
 * @param {String} configFilePath - Path to the configuration file
 * @returns {Object} - Parsed configuration with defaults applied
 */
async function getConfig(configFilePath) {
  try {
    // If no config file specified, try to find one in order of preference
    if (!configFilePath) {
      // Check for YAML first (it's more GitHub-friendly!)
      if (await fileExists('.release-boss.yml') || await fileExists('.release-boss.yaml')) {
        configFilePath = await fileExists('.release-boss.yml') ? '.release-boss.yml' : '.release-boss.yaml';
      } else {
        // Fall back to JSON if no YAML found
        configFilePath = '.release-boss.json';
      }
    }
    
    // Read config file
    const configData = await fs.readFile(configFilePath, 'utf8');
    let parsedConfig;
    
    // Parse based on file extension
    if (configFilePath.endsWith('.yml') || configFilePath.endsWith('.yaml')) {
      console.log(`Reading YAML config from ${configFilePath} - so trendy and GitHub-friendly! 💅`);
      parsedConfig = yaml.load(configData);
    } else {
      console.log(`Reading JSON config from ${configFilePath}`);
      parsedConfig = JSON.parse(configData);
    }
    
    // Merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...parsedConfig
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Config file not found: ${configFilePath}. Using default configuration.`);
      return DEFAULT_CONFIG;
    }
    
    throw new Error(`Failed to load config: ${error.message}`);
  }
}

/**
 * Helper function to check if a file exists
 * @param {String} filePath - Path to check
 * @returns {Promise<Boolean|String>} - Returns the path if file exists, false otherwise
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return false;
  }
}

/**
 * Validate the configuration
 * @param {Object} config - Configuration object
 * @throws {Error} - If configuration is invalid
 */
function validateConfig(config) {
  // Ensure required branches are specified
  if (!config.mergeBranch) {
    throw new Error('Configuration must specify a mergeBranch');
  }
  
  if (!config.stagingBranch) {
    throw new Error('Configuration must specify a stagingBranch');
  }
  
  if (!config.releaseBranch) {
    throw new Error('Configuration must specify a releaseBranch');
  }
  
  // Ensure PR title template includes version placeholder
  if (!config.pullRequestTitle || !config.pullRequestTitle.includes('{version}')) {
    throw new Error('pullRequestTitle must contain {version} placeholder');
  }
  
  // Validate file arrays if present
  if (config.templateFiles && !Array.isArray(config.templateFiles)) {
    throw new Error('templateFiles must be an array');
  }
  
  if (config.versionFiles && !Array.isArray(config.versionFiles)) {
    throw new Error('versionFiles must be an array');
  }
  
  // Validate changelog table config if enabled
  if (config.changelogTable) {
    // If not explicitly disabled, ensure it has the required properties
    if (config.changelogTable.enabled !== false) {
      // Set default values if not provided
      if (!config.changelogTable.columns || !Array.isArray(config.changelogTable.columns)) {
        config.changelogTable.columns = DEFAULT_CONFIG.changelogTable.columns;
      }
      
      if (!config.changelogTable.markers) {
        config.changelogTable.markers = DEFAULT_CONFIG.changelogTable.markers;
      }
      
      // Validate and set default sorting options
      if (!config.changelogTable.sorting) {
        config.changelogTable.sorting = DEFAULT_CONFIG.changelogTable.sorting;
      } else if (config.changelogTable.sorting.enabled !== false && 
                (!config.changelogTable.sorting.order || !Array.isArray(config.changelogTable.sorting.order))) {
        config.changelogTable.sorting.order = DEFAULT_CONFIG.changelogTable.sorting.order;
      }
      
      // Validate and set default filtering options
      if (!config.changelogTable.filtering) {
        config.changelogTable.filtering = DEFAULT_CONFIG.changelogTable.filtering;
      }
      
      // Validate and set default placement options
      if (!config.changelogTable.placement) {
        config.changelogTable.placement = DEFAULT_CONFIG.changelogTable.placement;
      }
      
      console.log(`Changelog table configuration validated and ready to slay! 💅`);
    }
  } else {
    // Add default changelog table config
    config.changelogTable = DEFAULT_CONFIG.changelogTable;
  }
  
  // Validate changelog sections
  if (config.changelogSections) {
    if (!Array.isArray(config.changelogSections)) {
      throw new Error('changelogSections must be an array');
    }
    
    for (const section of config.changelogSections) {
      if (!section.type || !section.section) {
        throw new Error('Each changelog section must have type and section properties');
      }
    }
  }
  
  return true;
}

module.exports = {
  getConfig,
  validateConfig,
  DEFAULT_CONFIG
};
