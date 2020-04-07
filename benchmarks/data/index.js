'use strict';

const fs = require('fs');
const path = require('path');

function getDataFile(filename, encoding = 'utf8') {
  return fs.readFileSync(path.join(__dirname, filename + '.json'), encoding);
}

module.exports = ['10', '150', '1k', '10k', '50k', '100k', '1M'].reduce(
  (acc, name) => {
    acc[name] = getDataFile(name);
    return acc;
  },
  {},
);
