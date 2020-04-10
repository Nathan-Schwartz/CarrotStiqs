const { clearAllMessages, handlerTestEnhancer } = require('../util');

const createCarrotStiqsClient = require('../../src/carrotstiqs');

const { command1, connectionUrls, topology, group1 } = require('./util');

describe('Commands Dead Letter Exchange', () => {
  it('Should insert the default dead letter config when undefined', async () => {
    expect.assertions(2);

    const moddedTopology = Object.assign({}, topology, {
      'post-mortem': { commands: ['dead-letter'], events: [] },
    });

    const createNewClient = () =>
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology: moddedTopology,
      });

    const defaultDLXClient = createNewClient();

    await clearAllMessages(createNewClient, moddedTopology);

    return new Promise(async (res, rej) => {
      const testMessage = 'one command';

      Promise.all([
        defaultDLXClient.initializeConsumerGroup(group1, {
          events: {},
          commands: {
            [command1]: {
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
      ]).then(() =>
        defaultDLXClient.sendCommand(command1, testMessage).catch(rej),
      );
    }).then(() => defaultDLXClient.close());
  });

  it('Should allow sending to dead letter command if it is enabled', async () => {
    expect.assertions(1);

    const topology = {
      'post-mortem': {
        commands: ['dead-letter'],
        events: [],
      },
    };
    const createNewClient = () =>
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology,
        deadLetterConfig: {
          disableSendingToDLX: false,
        },
      });

    const enableSendingToDLX = createNewClient();

    await clearAllMessages(createNewClient, topology);

    const testMessage = 'will not be rejected';

    return new Promise((res, rej) => {
      return enableSendingToDLX
        .initializeConsumerGroup('post-mortem', {
          events: {},
          commands: {
            'dead-letter': {
              prefetch: 1,
              handler: ({ message, acknowledgeMessage }) => {
                expect(message).toBe(testMessage);
                acknowledgeMessage();
                res();
              },
            },
          },
        })
        .then(() => {
          enableSendingToDLX.sendCommand('dead-letter', testMessage).catch(rej);
        })
        .catch(rej);
    }).then(() => enableSendingToDLX.close());
  });

  it('Should use custom command name as the dead letter exchange/queue', async () => {
    expect.assertions(2);

    const topology = {
      'post-mortem': { commands: ['nathan'], events: [] },
      alive: { commands: ['alive-command'], events: [] },
    };

    const createNewClient = () =>
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => console, error: () => {}, warn: () => {} },
        topology,
        deadLetterConfig: {
          commandName: 'nathan',
        },
      });

    const customDeadLetterClient = createNewClient();
    await clearAllMessages(createNewClient, topology);

    return new Promise((res, rej) => {
      const testMessage = 'one command';

      Promise.all([
        customDeadLetterClient.initializeConsumerGroup('alive', {
          events: {},
          commands: {
            'alive-command': {
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
        }),
        customDeadLetterClient.initializeConsumerGroup('post-mortem', {
          events: {},
          commands: {
            nathan: {
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
      ]).then(() =>
        customDeadLetterClient
          .sendCommand('alive-command', testMessage)
          .catch(rej),
      );
    }).then(() => customDeadLetterClient.close());
  });
});
