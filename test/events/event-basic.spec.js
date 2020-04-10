const { clearAllMessages, handlerTestEnhancer } = require('../util');

const {
  topology,
  group1,
  event1,
  clearGroup2AndGroup3,
  createNewClient,
} = require('./util');

describe('Events General Behavior', () => {
  let client = createNewClient();
  // We wait in order to avoid inconsistent errors closing channels.
  beforeEach(() => {
    return client.close().then(() => {
      client = createNewClient();
      return clearAllMessages(createNewClient, topology);
    });
  });

  afterAll(() => {
    return client.close();
  });

  it('Should be able to send and receive an event (string)', () => {
    expect.assertions(1);
    return new Promise(async (res, rej) => {
      const testMessage = 'one event';

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
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
        commands: {},
      });

      clearGroup2AndGroup3(client);

      client.sendEvent(event1, testMessage).catch(rej);
    });
  });

  it('Should be able to send and receive a command (buffer)', () => {
    expect.assertions(1);
    return new Promise(async (res, rej) => {
      const testMessageBuffer = Buffer.from('one event');
      const testMessageString = 'one event';

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage }) => {
                expect(message).toEqual(testMessageString);
                acknowledgeMessage();
                res();
              },
            ),
          },
        },
        commands: {},
      });

      client.sendEvent(event1, testMessageBuffer).catch(rej);
    });
  });

  it('Should be able to send and receive an event with extra options', () => {
    expect.assertions(2);
    clearGroup2AndGroup3(client);
    return new Promise(async (res, rej) => {
      const testMessage = 'command options';

      client.initializeConsumerGroup(group1, {
        commands: {},
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, messageObject, acknowledgeMessage }) => {
                expect(message).toEqual(testMessage);
                expect(messageObject.properties.headers.test).toEqual(
                  'hi there',
                );
                acknowledgeMessage();
                res();
              },
            ),
          },
        },
      });

      client
        .sendEvent(event1, testMessage, {
          headers: { test: 'hi there' },
        })
        .catch(rej);
    });
  });

  it('Should be able to send and receive multiple events', () => {
    const messageCount = 10;
    expect.assertions(messageCount);
    return new Promise(async (res, rej) => {
      const testMessage = 'many events';
      let counter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage }) => {
                expect(message).toEqual(testMessage);
                acknowledgeMessage();
                counter += 1;
                if (counter === messageCount) res();
              },
            ),
          },
        },
        commands: {},
      });

      clearGroup2AndGroup3(client);

      Promise.all(
        Array(messageCount)
          .fill()
          .map(() => client.sendEvent(event1, testMessage)),
      ).catch(rej);
    });
  });

  it('Should ack events and process them in order', () => {
    expect.assertions(3);
    return new Promise(async (res, rej) => {
      const testMessages = ['one', 'two', 'three'];
      let counter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage }) => {
                expect(message).toEqual(testMessages[counter]);
                counter += 1;
                acknowledgeMessage();
                if (counter === testMessages.length) {
                  res();
                }
              },
            ),
          },
        },
        commands: {},
      });

      clearGroup2AndGroup3(client);

      client
        .sendEvent(event1, testMessages[0])
        .then(() => client.sendEvent(event1, testMessages[1]))
        .then(() => client.sendEvent(event1, testMessages[2]))
        .catch(rej);
    });
  });

  it('Should allow nacking events. Nacked messages should be redelivered', () => {
    expect.assertions(4);
    return new Promise(async (res, rej) => {
      const testMessage = 'testing nack';

      let retryCounter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage, retryMessage }) => {
                expect(message).toEqual(testMessage);
                if (retryCounter === 3) {
                  acknowledgeMessage();
                  res();
                } else {
                  retryCounter += 1;
                  retryMessage();
                }
              },
            ),
          },
        },
        commands: {},
      });

      clearGroup2AndGroup3(client);

      client.sendEvent(event1, testMessage).catch(rej);
    });
  });

  it('Should should expose full amqplib message object', () => {
    expect.assertions(12);
    return new Promise(async (res, rej) => {
      const testMessage = 'testing nack';

      let retryCounter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({
                message,
                messageObject,
                acknowledgeMessage,
                retryMessage,
              }) => {
                expect(message).toEqual(testMessage);
                expect(message).toEqual(messageObject.content.toString());

                if (retryCounter === 0) {
                  expect(messageObject.fields.redelivered).toBe(false);
                } else {
                  expect(messageObject.fields.redelivered).toBe(true);
                }

                if (retryCounter === 3) {
                  acknowledgeMessage();
                  res();
                } else {
                  retryMessage();
                  retryCounter += 1;
                }
              },
            ),
          },
        },
        commands: {},
      });

      client.sendEvent(event1, testMessage).catch(rej);
    });
  });

  it('Should not break if calling acknowledgeMessage, discardMessage, and retryMessage. The first one should take effect.', () => {
    expect.assertions(4);
    return new Promise(async (res, rej) => {
      const testMessage = 'testing nack';

      let retryCounter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({
                message,
                acknowledgeMessage,
                discardMessage,
                retryMessage,
              }) => {
                expect(message).toEqual(testMessage);
                if (retryCounter === 3) {
                  acknowledgeMessage();
                  acknowledgeMessage();
                  res();
                } else {
                  retryCounter += 1;
                  retryMessage();
                  acknowledgeMessage();
                  discardMessage();
                  retryMessage();
                  discardMessage();
                }
              },
            ),
          },
        },
        commands: {},
      });

      clearGroup2AndGroup3(client);

      client.sendEvent(event1, testMessage).catch(rej);
    });
  });

  it('Should allow discarding events. They should not be redelivered', () => {
    expect.assertions(2);
    return new Promise(async (res, rej) => {
      const testMessage = 'testing discard';

      let messageCounter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage, discardMessage }) => {
                expect(message).toEqual(testMessage);
                messageCounter += 1;
                if (messageCounter === 1) {
                  discardMessage();
                } else if (messageCounter === 2) {
                  acknowledgeMessage();
                  res();
                } else {
                  // This would only happen if the message was redelivered, which shouldn't happen
                  rej(new Error('Should not redeliver discarded messages'));
                }
              },
            ),
          },
        },
        commands: {},
      });

      clearGroup2AndGroup3(client);

      Promise.all([
        client.sendEvent(event1, testMessage),
        client.sendEvent(event1, testMessage),
      ]).catch(rej);
    });
  });

  it('Should only allow one set of consumers per group within one client', () => {
    const messageCount = 10;
    expect.assertions(messageCount + 3);
    return new Promise(async (res, rej) => {
      const testMessage = 'one client';

      let firstHandlerCount = 0;
      let secondHandlerCount = 0;
      let thirdHandlerCount = 0;

      clearGroup2AndGroup3(client);

      const checkCompletion = () => {
        if (
          firstHandlerCount + secondHandlerCount + thirdHandlerCount ===
          messageCount
        ) {
          try {
            expect(firstHandlerCount).toEqual(10);
            expect(secondHandlerCount).toEqual(0);
            expect(thirdHandlerCount).toEqual(0);
            res();
          } catch (e) {
            rej(e);
          }
        }
      };

      Promise.all([
        client.initializeConsumerGroup(group1, {
          events: {
            [event1]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  acknowledgeMessage();
                  expect(message).toEqual(testMessage);
                  firstHandlerCount += 1;
                  checkCompletion();
                },
              ),
            },
          },
          commands: {},
        }),
        client.initializeConsumerGroup(group1, {
          events: {
            [event1]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  acknowledgeMessage();
                  expect(message).toEqual(testMessage);
                  secondHandlerCount += 1;
                  checkCompletion();
                },
              ),
            },
          },
          commands: {},
        }),
        client.initializeConsumerGroup(group1, {
          events: {
            [event1]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  acknowledgeMessage();
                  expect(message).toEqual(testMessage);
                  thirdHandlerCount += 1;
                  checkCompletion();
                },
              ),
            },
          },
          commands: {},
        }),
      ])
        .then(() =>
          Promise.all(
            Array(messageCount)
              .fill()
              .map(() => client.sendEvent(event1, testMessage)),
          ),
        )
        .catch(rej);
    });
  });

  it('Should allow one set of consumers per group per client', () => {
    const secondClient = createNewClient();
    const thirdClient = createNewClient();

    clearGroup2AndGroup3(client);

    const cleanupExtraClients = () =>
      Promise.all([secondClient.close(), thirdClient.close()]).then(() => {});

    const messageCount = 10;
    expect.assertions(messageCount + 3);
    return (
      new Promise(async (res, rej) => {
        const testMessage = 'three clients';

        let firstHandlerCount = 0;
        let secondHandlerCount = 0;
        let thirdHandlerCount = 0;

        const checkCompletion = () => {
          if (
            firstHandlerCount + secondHandlerCount + thirdHandlerCount ===
            messageCount
          ) {
            try {
              expect(firstHandlerCount).toBeGreaterThan(0);
              expect(secondHandlerCount).toBeGreaterThan(0);
              expect(thirdHandlerCount).toBeGreaterThan(0);
              res();
            } catch (e) {
              rej(e);
            }
          }
        };

        Promise.all([
          client.initializeConsumerGroup(group1, {
            events: {
              [event1]: {
                prefetch: 1,
                handler: handlerTestEnhancer(
                  rej,
                  async ({ message, acknowledgeMessage }) => {
                    acknowledgeMessage();
                    expect(message).toEqual(testMessage);
                    firstHandlerCount += 1;
                    checkCompletion();
                  },
                ),
              },
            },
            commands: {},
          }),
          secondClient.initializeConsumerGroup(group1, {
            events: {
              [event1]: {
                prefetch: 1,
                handler: handlerTestEnhancer(
                  rej,
                  async ({ message, acknowledgeMessage }) => {
                    acknowledgeMessage();
                    expect(message).toEqual(testMessage);
                    secondHandlerCount += 1;
                    checkCompletion();
                  },
                ),
              },
            },
            commands: {},
          }),
          thirdClient.initializeConsumerGroup(group1, {
            events: {
              [event1]: {
                prefetch: 1,
                handler: handlerTestEnhancer(
                  rej,
                  async ({ message, acknowledgeMessage }) => {
                    acknowledgeMessage();
                    expect(message).toEqual(testMessage);
                    thirdHandlerCount += 1;
                    checkCompletion();
                  },
                ),
              },
            },
            commands: {},
          }),
        ])
          .then(() =>
            Promise.all(
              Array(messageCount)
                .fill()
                .map(() => client.sendEvent(event1, testMessage)),
            ),
          )
          .catch(rej);
      })
        // After the messages are all resolved we want to clean up the clients
        .then(cleanupExtraClients)
        .catch((error) =>
          cleanupExtraClients().then(() => Promise.reject(error)),
        )
    );
  });

  it('Should allow a prefetch of 1', () => {
    const messageCount = 10;
    expect.assertions(messageCount + 1);
    return new Promise(async (res, rej) => {
      const testMessage = 'one prefetch event';

      let maxConcurrentmessages = 0;
      let concurrencyCounter = 0;
      let messageCounter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage }) => {
                expect(message).toEqual(testMessage);
                messageCounter += 1;
                concurrencyCounter += 1;
                setTimeout(() => {
                  // We want to store the maximum concurency
                  if (concurrencyCounter > maxConcurrentmessages) {
                    maxConcurrentmessages = concurrencyCounter;
                  }
                  concurrencyCounter -= 1;

                  // Acknowledge the message
                  acknowledgeMessage();

                  // Assert and resolve after the last message
                  if (
                    messageCount === messageCounter &&
                    concurrencyCounter === 0
                  ) {
                    expect(maxConcurrentmessages).toBe(1);

                    res();
                  }
                }, 250);
              },
            ),
          },
        },
        commands: {},
      });

      clearGroup2AndGroup3(client);

      Promise.all(
        Array(messageCount)
          .fill()
          .map(() => client.sendEvent(event1, testMessage)),
      ).catch(rej);
    });
  });

  it('Should allow a higher prefetch (5)', () => {
    const messageCount = 10;
    expect.assertions(messageCount + 1);
    return new Promise(async (res, rej) => {
      const testMessage = 'five prefetch event';

      let maxConcurrentmessages = 0;
      let concurrencyCounter = 0;
      let messageCounter = 0;

      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
            prefetch: 5,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage }) => {
                expect(message).toEqual(testMessage);
                messageCounter += 1;
                concurrencyCounter += 1;
                setTimeout(() => {
                  // We want to store the maximum concurency
                  if (concurrencyCounter > maxConcurrentmessages) {
                    maxConcurrentmessages = concurrencyCounter;
                  }
                  concurrencyCounter -= 1;

                  // Acknowledge the message
                  acknowledgeMessage();

                  // Assert and resolve after the last message
                  if (
                    messageCount === messageCounter &&
                    concurrencyCounter === 0
                  ) {
                    expect(maxConcurrentmessages).toBe(5);

                    res();
                  }
                }, 250);
              },
            ),
          },
        },
        commands: {},
      });

      clearGroup2AndGroup3(client);

      Promise.all(
        Array(messageCount)
          .fill()
          .map(() => client.sendEvent(event1, testMessage)),
      ).catch(rej);
    });
  });
});
