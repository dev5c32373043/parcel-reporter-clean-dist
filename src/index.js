const path = require('path');

const { Reporter } = require('@parcel/plugin');

const utils = require('./utils');
const getFilesToRemove = require('./getFilesToRemove');
const removeFiles = require('./removeFiles');
const opsLimiter = require('./opsLimiter')();

const removeFileReporter = new Reporter({
  async report({ event, options }) {
    if (event.type === 'buildSuccess') {
      const bundles = event.bundleGraph.getBundles();
      const distPaths = [];
      const filesToExclude = [];

      bundles.forEach(b => { // excluding files of the current build from removal
        if (b.target && b.target.distDir && !distPaths.includes(b.target.distDir)) {
          distPaths.push(b.target.distDir);
        }

        if (!filesToExclude.includes(b.filePath)) {
          filesToExclude.push(b.filePath);
          // excluding .map files as well
          if (['.js', '.css'].includes(path.extname(b.filePath))) {
            filesToExclude.push(`${b.filePath}.map`);
          }
        }
      });

      const filesToRemove = await getFilesToRemove(options.projectRoot, distPaths, filesToExclude);

      if (!utils.isArray(filesToRemove)) return; // if no files to remove, there is nothing to do for us

      filesToRemove.forEach(fileToRemove => { // dividing remove files operations by groups
        const cleanDistFile = () => removeFiles(fileToRemove);
        opsLimiter.queue.push(cleanDistFile);
      });

      await opsLimiter.exec(); // executing operations by chunks
    }
  },
});

module.exports = removeFileReporter;
