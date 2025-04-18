/**
 * This file defines the current version of Release Boss
 * It gets processed during releases to update the version number
 */

const VERSION = '{{version}}';
const VERSION_WITH_V = 'v{{version}}';

module.exports = {
  VERSION,
  VERSION_WITH_V,
  MAJOR: '{{major}}',
  MINOR: '{{minor}}',
  PATCH: '{{patch}}'
};
