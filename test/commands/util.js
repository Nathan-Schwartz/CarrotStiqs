const createCarrotStiqsClient = require('../../src/carrotstiqs');

const group1 = 'command-group-1';
const group2 = 'command-group-2';
const group3 = 'command-group-3';
const group4 = 'command-group-4';
const command1 = 'command1';
const command2 = 'command2';

const topology = {
  [group1]: {
    events: [],
    commands: [command1],
  },
  [group2]: {
    events: [],
    commands: [command2],
  },
  [group3]: {
    events: [],
    commands: [command2],
  },
  [group4]: {
    events: [command1],
    commands: [],
  },
};

const connectionUrls = [
  process.env.CLOUDAMQP_URL || 'amqp://guest:guest@localhost:5672',
];

const createNewClient = () =>
  createCarrotStiqsClient({
    connectionUrls,
    logger: { log: () => {}, error: () => {}, warn: () => {} },
    topology,
  });

module.exports = {
  command1,
  command2,
  connectionUrls,
  createNewClient,
  group1,
  group2,
  group3,
  group4,
  topology,
};
