const { handlerTestEnhancer } = require('../util');

const {
  command1,
  command2,
  createNewClient,
  group1,
  group2,
  group3,
  group4,
  waitFor,
} = require('./util');

describe('Commands Specific Behavior', () => {
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

  it.skip('Should deliver commands multiple times if nacked, but may only be successfully processed once', () => {
    // Established in general tests
  });

  it.skip('Should allow delivery when the sending client has a local consumer for the command', () => {
    // Established in general tests
  });

  it('Should only deliver a command to one consumer, regardless of the number of consumers or groups for that command', () => {
    const secondClient = createNewClient();
    const thirdClient = createNewClient();

    const cleanupExtraClients = () =>
      Promise.all([secondClient.close(), thirdClient.close()]).then(() => {});

    const messageCount = 10;
    expect.assertions(messageCount + 4);
    return (
      new Promise(async (res, rej) => {
        const testMessage = 'process once, two groups';

        let firstHandlerCount = 0;
        let secondHandlerCount = 0;
        let thirdHandlerCount = 0;

        const checkCompletion = () => {
          if (
            firstHandlerCount + secondHandlerCount + thirdHandlerCount ===
            messageCount
          ) {
            setTimeout(() => {
              // delaying assertions to allow any stragglers to be processed
              expect(firstHandlerCount).toBeGreaterThan(0);
              expect(secondHandlerCount).toBeGreaterThan(0);
              expect(thirdHandlerCount).toBeGreaterThan(0);
              expect(
                firstHandlerCount + secondHandlerCount + thirdHandlerCount,
              ).toEqual(messageCount);
              res();
            }, 500);
          }
        };

        Promise.all([
          client.initializeConsumerGroup(group2, {
            events: {},
            commands: {
              [command2]: {
                prefetch: 1,
                handler: handlerTestEnhancer(
                  rej,
                  async ({ message, acknowledgeMessage }) => {
                    setTimeout(() => {
                      acknowledgeMessage();
                      expect(message).toEqual(testMessage);
                      firstHandlerCount += 1;
                      checkCompletion();
                    }, 20);
                  },
                ),
              },
            },
          }),
          secondClient.initializeConsumerGroup(group3, {
            events: {},
            commands: {
              [command2]: {
                prefetch: 1,
                handler: handlerTestEnhancer(
                  rej,
                  async ({ message, acknowledgeMessage }) => {
                    setTimeout(() => {
                      acknowledgeMessage();
                      expect(message).toEqual(testMessage);
                      secondHandlerCount += 1;
                      checkCompletion();
                    }, 20);
                  },
                ),
              },
            },
          }),
          thirdClient.initializeConsumerGroup(group3, {
            events: {},
            commands: {
              [command2]: {
                prefetch: 1,
                handler: handlerTestEnhancer(
                  rej,
                  async ({ message, acknowledgeMessage }) => {
                    setTimeout(() => {
                      expect(message).toEqual(testMessage);
                      thirdHandlerCount += 1;
                      acknowledgeMessage();
                      checkCompletion();
                    }, 20);
                  },
                ),
              },
            },
          }),
        ])
          .then(() =>
            Promise.all(
              Array(messageCount)
                .fill()
                .map(() => client.sendCommand(command2, testMessage)),
            ),
          )
          .catch(rej);
      })
        // After the messages are all resolved we want to clean up the clients
        .then(cleanupExtraClients)
        .catch(error => cleanupExtraClients().then(() => Promise.reject(error)))
    );
  });

  it('Should allow delivery when the sending client does not have a local consumer for the command', () => {
    const secondClient = createNewClient();

    const cleanupExtraClients = () => secondClient.close().then(() => {});

    const messageCount = 10;
    expect.assertions(messageCount + 1);
    return (
      new Promise(async (res, rej) => {
        const testMessage = 'process once, two groups';

        let counter = 0;

        const checkCompletion = () => {
          if (counter === messageCount) {
            setTimeout(() => {
              // delaying assertions to allow any stragglers to be processed
              expect(counter).toEqual(messageCount);
              res();
            }, 500);
          }
        };

        secondClient.initializeConsumerGroup(group3, {
          events: {},
          commands: {
            [command2]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  setTimeout(() => {
                    acknowledgeMessage();
                    expect(message).toEqual(testMessage);
                    counter += 1;
                    checkCompletion();
                  }, 20);
                },
              ),
            },
          },
        });

        Promise.all(
          Array(messageCount)
            .fill()
            .map(() => client.sendCommand(command2, testMessage)),
        ).catch(rej);
      })
        // After the messages are all resolved we want to clean up the clients
        .then(cleanupExtraClients)
        .catch(error => cleanupExtraClients().then(() => Promise.reject(error)))
    );
  });

  it('Should receive messages even if consumers are not active', () => {
    const messageCount = 30;
    expect.assertions(messageCount + 1);

    return new Promise(async (res, rej) => {
      const testMessage = 'once per group';
      let messageCounter = 0;

      Promise.all(
        Array(messageCount)
          .fill()
          .map(() => client.sendCommand(command1, testMessage)),
      )
        .then(() =>
          Promise.all([
            client.initializeConsumerGroup(group1, {
              events: {},
              commands: {
                [command1]: {
                  prefetch: 1,
                  handler: handlerTestEnhancer(
                    rej,
                    async ({ message, acknowledgeMessage }) => {
                      setTimeout(() => {
                        expect(message).toEqual(testMessage);

                        // Increment counters
                        messageCounter += 1;

                        // Acknowledge the message
                        acknowledgeMessage();

                        // If all messages are done being delivered, wait for any extras and then run assertions
                        if (messageCount === messageCounter) {
                          setTimeout(() => {
                            expect(messageCounter).toEqual(messageCount);
                            res();
                          }, 100);
                        }
                      }, 20);
                    },
                  ),
                },
              },
            }),
          ]),
        )
        .catch(rej);
    });
  });

  it('Should not allow command consumers to receive events with the same name', () => {
    const messageCount = 3;
    expect.assertions(messageCount);
    const testMessage = 'command not consumed by event handler';
    let messageCounter = 0;
    return new Promise((res, rej) => {
      client.initializeConsumerGroup(group1, {
        events: {},
        commands: {
          [command1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(
              rej,
              async ({ message, acknowledgeMessage }) => {
                messageCounter += 1;
                expect(message).toEqual(testMessage);
                acknowledgeMessage();
                if (messageCounter === messageCount) {
                  res();
                }
              },
            ),
          },
        },
      });

      client.initializeConsumerGroup(group4, {
        events: {
          [command1]: {
            prefetch: 1,
            handler: handlerTestEnhancer(rej, async () => {
              rej(new Error('Event handler should not receive commands'));
            }),
          },
        },
        commands: {},
      });

      Promise.all(
        Array(messageCount)
          .fill()
          .map(() => client.sendCommand(command1, testMessage)),
      ).catch(rej);
    });
  });
});
