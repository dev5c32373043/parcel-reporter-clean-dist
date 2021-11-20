const fs = require('fs/promises');
const path = require('path');

const glob = require('fast-glob');

const utils = require('./utils');

/**
 * Parses file paths for removal.
 * @param {String} projectPath root directory of the project
 * @param {String[]} distPaths unique dist paths of the current build
 * @param {String[]} filesToExclude dist files of the current bundle
 * @returns {Promise<String[]>} file paths to remove
 */

const getFilesToRemove = async (projectPath, distPaths, filesToExclude = []) => {
  const packageJson = JSON.parse(await fs.readFile(path.posix.join(projectPath, 'package.json')));
  const cleanDistFiles = [];

  if (utils.isArray(packageJson.cleanDistFiles) && packageJson.cleanDistFiles.length) {
    // files to be excluded should be processed first
    const sortedFiles = packageJson.cleanDistFiles.sort(a => (a.startsWith('!') ? -1 : 1));
    cleanDistFiles.push(...sortedFiles);
  }

  const filesToRemove = new Set([]);

  // if no configuration is provided, then we cleanup all files that are not contained in the current bundle
  if (utils.isEmpty(cleanDistFiles)) {
    for (const distPath of distPaths) {
      const fileNames = await fs.readdir(distPath); // eslint-disable-line no-await-in-loop

      fileNames.forEach(fileName => {
        const filePath = path.posix.join(distPath, fileName);
        if (filesToExclude.includes(filePath)) return;
        filesToRemove.add(filePath);
      });
    }

    return Array.from(filesToRemove);
  }

  /**
   * Checks is path contains any of dist folders
   * @param {String} p file path to be checked
   * @returns {Boolean} boolean result of the check
   */

  const isFileInsideDist = p => distPaths.some(distPath => p.includes(distPath));

  /**
   * Checks is path should be excluded from removal(skipping path if matching exact path or parent folder)
   * @param {String} filePath file path to be checked
   * @returns {Boolean} boolean result of the check
   */

  const isFileExcluded = fp => (
    filesToExclude.includes(fp) || filesToExclude.some(p => fp.includes(p) || p.includes(fp))
  );

  // when configuration contains only files to exclude, we assume all other files must be removed
  if (cleanDistFiles.every(p => p.startsWith('!'))) {
    const relativeDistPaths = distPaths.map(p => path.posix.resolve(`${p.replace(projectPath, '')}/**/*`));
    cleanDistFiles.push(...relativeDistPaths);
  }

  for (const itemToRemove of cleanDistFiles) {
    if (!utils.isString(itemToRemove)) continue; // eslint-disable-line no-continue

    let filePath = path.posix.join(projectPath, itemToRemove);

    if (glob.isDynamicPattern(itemToRemove)) {
      let filesToBeExcluded = false;
      const globResults = [];

      if (itemToRemove.startsWith('!')) {
        filesToBeExcluded = true;
        filePath = filePath.replace('!', '');
      }

      for await (const finalPath of glob.stream(filePath, { onlyFiles: false })) { // eslint-disable-line no-await-in-loop
        // excluding entity inside block list or file outside of dist folder
        if (!isFileExcluded(finalPath) && isFileInsideDist(finalPath)) {
          if (filesToBeExcluded) {
            filesToExclude.push(finalPath);
          } else {
            globResults.push(finalPath);
          }
        }
      }

      globResults.forEach(finalPath => { // excluding files when whole dir matched to prevent dups
        const dirAlreadyIncluded = globResults.some(p => (p !== finalPath && finalPath.includes(p)));

        if (!dirAlreadyIncluded) {
          filesToRemove.add(finalPath);

          if (['.js', '.css'].includes(path.extname(finalPath))) { // most probably .map files should be removed as well
            filesToRemove.add(`${finalPath}.map`);
          }
        }
      });
    } else if (isFileInsideDist(filePath)) {
      filesToRemove.add(filePath);
    }
  }

  return Array.from(filesToRemove);
};

module.exports = getFilesToRemove;
