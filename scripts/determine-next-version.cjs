#!/usr/bin/env node

const fs = require('fs');

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  const leftParsed = typeof left === 'string' ? parseVersion(left) : left;
  const rightParsed = typeof right === 'string' ? parseVersion(right) : right;
  if (!leftParsed || !rightParsed) {
    throw new Error('Cannot compare invalid semantic versions.');
  }
  if (leftParsed.major !== rightParsed.major) {
    return leftParsed.major - rightParsed.major;
  }
  if (leftParsed.minor !== rightParsed.minor) {
    return leftParsed.minor - rightParsed.minor;
  }
  return leftParsed.patch - rightParsed.patch;
}

function findVersionsInChangelogMarkdown(content) {
  const versions = [];
  const regex = /^##\s+(?:\[(\d+\.\d+\.\d+)\]|(\d+\.\d+\.\d+))\s+-\s+/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    versions.push(match[1] || match[2]);
  }
  return versions;
}

function findVersionsInChangelogJson(content) {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => (entry && typeof entry.version === 'string' ? entry.version : null))
      .filter((version) => parseVersion(version));
  } catch {
    return [];
  }
}

function findHighestVersion(versions) {
  return versions.reduce((highest, current) => {
    if (!highest || compareVersions(current, highest) > 0) {
      return current;
    }
    return highest;
  }, null);
}

function determineNextVersion({ latestTag, changelogMarkdown, changelogJson }) {
  const latestVersion = latestTag?.startsWith('v') ? latestTag.slice(1) : latestTag;
  const latestParsed = parseVersion(latestVersion || '');
  const discoveredVersions = [
    ...findVersionsInChangelogMarkdown(changelogMarkdown || ''),
    ...findVersionsInChangelogJson(changelogJson || ''),
  ];
  const highestDiscovered = findHighestVersion(discoveredVersions);
  if (latestParsed && highestDiscovered && compareVersions(highestDiscovered, latestVersion) > 0) {
    return highestDiscovered;
  }
  if (latestParsed) {
    return `${latestParsed.major}.${latestParsed.minor}.${latestParsed.patch + 1}`;
  }
  return highestDiscovered || '1.0.0';
}

if (require.main === module) {
  const latestTag = process.argv[2] || '';
  const changelogMarkdown = fs.existsSync('CHANGELOG.md')
    ? fs.readFileSync('CHANGELOG.md', 'utf8')
    : '';
  const changelogJson = fs.existsSync('assets/changelog.json')
    ? fs.readFileSync('assets/changelog.json', 'utf8')
    : '';
  const nextVersion = determineNextVersion({ latestTag, changelogMarkdown, changelogJson });
  process.stdout.write(`${nextVersion}\n`);
}

module.exports = {
  compareVersions,
  determineNextVersion,
  findVersionsInChangelogJson,
  findVersionsInChangelogMarkdown,
  parseVersion,
};
