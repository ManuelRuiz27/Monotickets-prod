#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const paths = [
  path.resolve(__dirname, '../../reports/junit'),
  path.resolve(__dirname, '../../reports/allure'),
  path.resolve(__dirname, '../../coverage'),
  path.resolve(__dirname, '../artifacts'),
];

const ensureDirectory = (target) => {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
    console.log(`Created directory: ${target}`);
  }
};

try {
  paths.forEach((target) => ensureDirectory(target));
  console.log('Artifact directories are ready.');
} catch (error) {
  console.warn(`Artifact collection script failed: ${error.message}`);
  process.exitCode = 0;
}
