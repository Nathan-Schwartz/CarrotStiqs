const { handlerTestEnhancer } = require('../util');

const createCarrotStiqsClient = require('../../src/carrotstiqs');

const {
  command1,
  connectionUrls,
  createNewClient,
  group1,
  topology,
  waitFor,
} = require('./util');

describe('Commands Delayed Retries', () => {
  let client = createNewClient();

  // We wait in order to avoid inconsistent errors closing channels.
  beforeEach(() => {
    return waitFor(500)
      .then(() => client.close())
      .then(() => {
        client = createNewClient();
      });
  });

  afterAll(() => {
    return waitFor(500).then(() => client.close());
  });

  it('Should expose delayedRetryMessage to the handler if disableRetryQueues is false', () => {
    expect.assertions(2);
    return new Promise(async (res, rej) => {
      const testMessage = 'delayedRetryMessage exists';

      client.initializeConsumerGroup(group1, {
        events: {},
        commands: {
          [command1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ delayedRetryMessage, message, acknowledgeMessage }) => {
                expect(typeof delayedRetryMessage).toEqual('function');
                expect(message).toEqual(testMessage);
                acknowledgeMessage();
                res();
              },
            ),
          },
        },
      });

      client.sendCommand(command1, testMessage).catch(rej);
    });
  });

  it('Should not expose delayedRetryMessage to the handler if disableRetryQueues is true', () => {
    expect.assertions(2);

    const disabledClient = createCarrotStiqsClient({
      connectionUrls,
      logger: { log: () => {}, error: () => {}, warn: () => {} },
      topology,
      disableRetryQueues: true,
    });

    return new Promise(async (res, rej) => {
      const testMessage = 'delayedRetryMessage not exists';

      disabledClient.initializeConsumerGroup(group1, {
        events: {},
        commands: {
          [command1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ delayedRetryMessage, message, acknowledgeMessage }) => {
                expect(typeof delayedRetryMessage).toEqual('undefined');
                expect(message).toEqual(testMessage);
                acknowledgeMessage();
                res();
              },
            ),
          },
        },
      });

      disabledClient.sendCommand(command1, testMessage).catch(rej);
    }).then(() => disabledClient.close());
  });

  it('Should retry a message after the specified wait time', () => {
    expect.assertions(3);
    const order = [];
    return new Promise(async (res, rej) => {
      const testMessage = 'wait time command';

      let firstTry = true;

      client.initializeConsumerGroup(group1, {
        events: {},
        commands: {
          [command1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ delayedRetryMessage, message, acknowledgeMessage }) => {
                expect(message).toEqual(testMessage);
                if (firstTry) {
                  firstTry = false;
                  order.push('retry');
                  await delayedRetryMessage(5);
                  setTimeout(() => {
                    order.push('waited');
                  }, 4.5 * 1000);
                } else {
                  order.push('ack');
                  acknowledgeMessage();
                  res();
                }
              },
            ),
          },
        },
      });

      client.sendCommand(command1, testMessage).catch(rej);
    }).then(() => {
      expect(order).toEqual(['retry', 'waited', 'ack']);
    });
  }, 10000);

  it('Should increment retryCount each time a message is retried using delayedRetryMessage', () => {
    expect.assertions(12);
    let retries = -1;
    return new Promise(async (res, rej) => {
      const testMessage = 'retryCount increment';

      client.initializeConsumerGroup(group1, {
        events: {},
        commands: {
          [command1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({
                messageObject,
                delayedRetryMessage,
                message,
                acknowledgeMessage,
              }) => {
                expect(message).toEqual(testMessage);
                retries++;
                if (retries === 0) {
                  await delayedRetryMessage(0);
                  expect(messageObject.properties.headers.retryCount).toEqual(
                    undefined,
                  );
                } else if (retries < 5) {
                  await delayedRetryMessage(0);
                  expect(messageObject.properties.headers.retryCount).toEqual(
                    retries,
                  );
                } else {
                  expect(messageObject.properties.headers.retryCount).toEqual(
                    5,
                  );
                  acknowledgeMessage();
                  res();
                }
              },
            ),
          },
        },
      });

      client.sendCommand(command1, testMessage).catch(rej);
    });
  }, 10000);

  it('Should allow messages to modify message options each time the message is retried', () => {
    expect.assertions(15);
    let retries = -1;
    return new Promise(async (res, rej) => {
      const testMessage = 'retryCount options';

      client.initializeConsumerGroup(group1, {
        events: {},
        commands: {
          [command1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({
                messageObject,
                delayedRetryMessage,
                message,
                acknowledgeMessage,
              }) => {
                expect(message).toEqual(testMessage);
                retries++;
                if (retries === 0) {
                  await delayedRetryMessage(0, {
                    headers: { hello: 'test' + (retries + 1) },
                  });

                  expect(messageObject.properties.headers.retryCount).toEqual(
                    undefined,
                  );
                  expect(messageObject.properties.headers.hello).toEqual(
                    undefined,
                  );
                } else if (retries < 4) {
                  await delayedRetryMessage(0, {
                    headers: { hello: 'test' + (retries + 1) },
                  });

                  expect(messageObject.properties.headers.retryCount).toEqual(
                    retries,
                  );
                  expect(messageObject.properties.headers.hello).toEqual(
                    'test' + retries,
                  );
                } else {
                  expect(messageObject.properties.headers.retryCount).toEqual(
                    4,
                  );
                  expect(messageObject.properties.headers.hello).toEqual(
                    'test' + retries,
                  );

                  acknowledgeMessage();
                  res();
                }
              },
            ),
          },
        },
      });

      client.sendCommand(command1, testMessage).catch(rej);
    });
  }, 15000);

  it.skip('Should send successfully before acking', () => {});
});
