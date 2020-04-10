const { clearAllMessages, handlerTestEnhancer } = require('../util');

const createCarrotStiqsClient = require('../../src/carrotstiqs');

const {
  event1,
  connectionUrls,
  topology,
  group1,
  clearGroup2AndGroup3,
} = require('./util');

describe('Events Dead Letter Exchange', () => {
  it('Should insert the default dead letter config when undefined', async () => {
    expect.assertions(2);
    const moddedTopology = Object.assign({}, topology, {
      'post-mortem': { commands: ['dead-letter'], events: [] },
    });

    const createClient = () =>
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology: moddedTopology,
      });

    const defaultDLXClient = createClient();
    await clearAllMessages(createClient, moddedTopology);

    return new Promise(async (res, rej) => {
      const testMessage = 'one event';

      Promise.all([
        defaultDLXClient.initializeConsumerGroup(group1, {
          events: {
            [event1]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, discardMessage }) => {
                  expect(message).toEqual(testMessage);
                  discardMessage();
                },
              ),
            },
          },
          commands: {},
        }),
        defaultDLXClient.initializeConsumerGroup('post-mortem', {
          events: {},
          commands: {
            'dead-letter': {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  expect(message).toEqual(testMessage);
                  acknowledgeMessage();
                  res();
                },
              ),
            },
          },
        }),
      ]).then(() => {
        clearGroup2AndGroup3(defaultDLXClient);

        defaultDLXClient.sendEvent(event1, testMessage).catch(rej);
      });
    }).then(() => defaultDLXClient.close());
  });
});
