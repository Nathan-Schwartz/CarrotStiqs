// This file generates a client with benchmark topology that uses the options passed in.
// This allows us to focus on suite logic in the suiteGenerator
const createCarrotStiqsClient = require('../dist/carrotstiqs');

const group1 = 'benchmark-group-1';
const group2 = 'benchmark-group-2';
const group3 = 'benchmark-group-3';
const command = 'benchmark-command';
const event = 'benchmark-event';

const topology = {
  [group1]: {
    events: [event],
    commands: [command],
  },
  [group2]: {
    events: [event],
    commands: [],
  },
  [group3]: {
    events: [event],
    commands: [],
  },
};

const connectionUrls = [
  process.env.CLOUDAMQP_URL || 'amqp://guest:guest@localhost:5672',
];

function setupClient({ prefetch, doWork, msgCount, suiteMutableState }) {
  let client = createCarrotStiqsClient({
    connectionUrls,
    logger: { log: () => {}, error: () => {}, warn: () => {} },
    topology,
  });

  client.initializeConsumerGroup(group1, {
    events: {
      [event]: {
        prefetch,
        handler: async ({ acknowledgeMessage }) => {
          await doWork();
          suiteMutableState.group1EventCounter += 1;
          acknowledgeMessage();
          if (
            suiteMutableState.group1EventCounter === msgCount &&
            suiteMutableState.group2EventCounter === msgCount &&
            suiteMutableState.group3EventCounter === msgCount
          ) {
            suiteMutableState.cb();
          }
        },
      },
    },
    commands: {
      [command]: {
        prefetch,
        handler: async ({ acknowledgeMessage }) => {
          await doWork();
          suiteMutableState.commandCounter += 1;
          acknowledgeMessage();
          if (suiteMutableState.commandCounter === msgCount) {
            suiteMutableState.cb();
          }
        },
      },
    },
  });

  client.initializeConsumerGroup(group2, {
    events: {
      [event]: {
        prefetch,
        handler: async ({ acknowledgeMessage }) => {
          await doWork();
          suiteMutableState.group2EventCounter += 1;
          acknowledgeMessage();
          if (
            suiteMutableState.group1EventCounter === msgCount &&
            suiteMutableState.group2EventCounter === msgCount &&
            suiteMutableState.group3EventCounter === msgCount
          ) {
            suiteMutableState.cb();
          }
        },
      },
    },
    commands: {},
  });

  client.initializeConsumerGroup(group3, {
    events: {
      [event]: {
        prefetch,
        handler: async ({ acknowledgeMessage }) => {
          await doWork();
          suiteMutableState.group3EventCounter += 1;
          acknowledgeMessage();
          if (
            suiteMutableState.group1EventCounter === msgCount &&
            suiteMutableState.group2EventCounter === msgCount &&
            suiteMutableState.group3EventCounter === msgCount
          ) {
            suiteMutableState.cb();
          }
        },
      },
    },
    commands: {},
  });
  return client;
}

module.exports = { setupClient, event, command };
