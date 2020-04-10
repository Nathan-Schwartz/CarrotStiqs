const createCarrotStiqsClient = require('../../src/carrotstiqs');

const group1 = 'event-group-1';
const group2 = 'event-group-2';
const group3 = 'event-group-3';
const group4 = 'event-group-4';
const event1 = 'event1';
const event2 = 'event2';
const event3 = 'event3';

const topology = {
  [group1]: {
    events: [event1],
    commands: [],
  },
  [group2]: {
    events: [event1, event2],
    commands: [],
  },
  [group3]: {
    events: [event1, event2, event3],
    commands: [],
  },
  [group4]: {
    events: [],
    commands: [event1],
  },
};

function clearGroup2AndGroup3(client) {
  client.initializeConsumerGroup(group2, {
    events: {
      [event1]: {
        prefetch: 1,
        handler: async ({ acknowledgeMessage }) => acknowledgeMessage(),
      },
      [event2]: {
        prefetch: 1,
        handler: async ({ acknowledgeMessage }) => acknowledgeMessage(),
      },
    },
    commands: {},
  });

  client.initializeConsumerGroup(group3, {
    events: {
      [event1]: {
        prefetch: 1,
        handler: async ({ acknowledgeMessage }) => acknowledgeMessage(),
      },
      [event2]: {
        prefetch: 1,
        handler: async ({ acknowledgeMessage }) => acknowledgeMessage(),
      },
      [event3]: {
        prefetch: 1,
        handler: async ({ acknowledgeMessage }) => acknowledgeMessage(),
      },
    },
    commands: {},
  });
}

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
  clearGroup2AndGroup3,
  connectionUrls,
  createNewClient,
  event1,
  event2,
  event3,
  group1,
  group2,
  group3,
  group4,
  topology,
};
