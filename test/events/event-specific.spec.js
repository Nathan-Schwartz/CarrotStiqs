const { handlerTestEnhancer } = require('../util');

const {
  waitFor,
  group1,
  group2,
  group3,
  group4,
  event1,
  event2,
  event3,
  clearGroup2AndGroup3,
  createNewClient,
} = require('./util');

describe('Event specific behavior', () => {
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

  it.skip('should behave like a command if there is only one consuming group', () => {
    // This is actually covered in the general tests
  });

  it.skip('Should redeliver events within a group if nacked', () => {});

  it.skip('Should allow delivery when the sending client has a local consumer for the event', () => {
    // Covered in other tests
  });

  it('Should process events once per group', () => {
    const messageCount = 30;
    expect.assertions(messageCount * 3 + 3);

    return new Promise(async (res, rej) => {
      const testMessage = 'once per group';
      const groupCounters = { 1: 0, 2: 0, 3: 0 };

      function handleMessage({ group, acknowledgeMessage, message }) {
        setTimeout(() => {
          expect(message).toEqual(testMessage);

          // Increment counters
          groupCounters[group] += 1;

          // Acknowledge the message
          acknowledgeMessage();

          // If all messages are done being delivered, wait for any extras and then run assertions
          if (
            messageCount === groupCounters[1] &&
            messageCount === groupCounters[2] &&
            messageCount === groupCounters[3]
          ) {
            setTimeout(() => {
              expect(groupCounters[1]).toEqual(messageCount);
              expect(groupCounters[2]).toEqual(messageCount);
              expect(groupCounters[3]).toEqual(messageCount);

              res();
            }, 100);
          }
        }, 20);
      }

      Promise.all([
        client.initializeConsumerGroup(group1, {
          events: {
            [event1]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  handleMessage({ message, acknowledgeMessage, group: 1 });
                },
              ),
            },
          },
          commands: {},
        }),
        client.initializeConsumerGroup(group2, {
          events: {
            [event1]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  handleMessage({ message, acknowledgeMessage, group: 2 });
                },
              ),
            },
            [event2]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ acknowledgeMessage }) => {
                  return acknowledgeMessage();
                },
              ),
            },
          },
          commands: {},
        }),
        client.initializeConsumerGroup(group3, {
          events: {
            [event1]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ message, acknowledgeMessage }) => {
                  handleMessage({ message, acknowledgeMessage, group: 3 });
                },
              ),
            },
            [event2]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ acknowledgeMessage }) => {
                  acknowledgeMessage();
                },
              ),
            },
            [event3]: {
              prefetch: 1,
              handler: handlerTestEnhancer(
                rej,
                async ({ acknowledgeMessage }) => {
                  acknowledgeMessage();
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

  it('Should load balance events within a group across clients', () => {
    const messageCount = 30;
    expect.assertions(messageCount * 3 + 6);

    const secondClient = createNewClient();
    const thirdClient = createNewClient();

    const cleanupExtraClients = () =>
      Promise.all([secondClient.close(), thirdClient.close()]).then(() => {});

    return (
      new Promise(async (res, rej) => {
        const testMessage = 'once per group';
        const groupCounters = { 1: 0, 2: 0, 3: 0 };
        const clientCounters = { 1: 0, 2: 0, 3: 0 };

        function handleMessage({ group, client, acknowledgeMessage, message }) {
          setTimeout(() => {
            expect(message).toEqual(testMessage);

            // Increment counters
            groupCounters[group] += 1;
            clientCounters[client] += 1;

            // Acknowledge the message
            acknowledgeMessage();

            // If all messages are done being delivered, wait for any extras and then run assertions
            if (
              messageCount === groupCounters[1] &&
              messageCount === groupCounters[2] &&
              messageCount === groupCounters[3]
            ) {
              setTimeout(() => {
                expect(groupCounters[1]).toEqual(messageCount);
                expect(groupCounters[2]).toEqual(messageCount);
                expect(groupCounters[3]).toEqual(messageCount);

                expect(clientCounters[1]).toBeGreaterThan(20);
                expect(clientCounters[2]).toBeGreaterThan(20);
                expect(clientCounters[3]).toBeGreaterThan(20);

                res();
              }, 100);
            }
          }, 20);
        }

        Promise.all(
          [client, secondClient, thirdClient].map((currentClient, i) =>
            Promise.all([
              currentClient.initializeConsumerGroup(group1, {
                events: {
                  [event1]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ message, acknowledgeMessage }) => {
                        handleMessage({
                          message,
                          acknowledgeMessage,
                          client: i + 1,
                          group: 1,
                        });
                      },
                    ),
                  },
                },
                commands: {},
              }),
              currentClient.initializeConsumerGroup(group2, {
                events: {
                  [event1]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ message, acknowledgeMessage }) => {
                        handleMessage({
                          message,
                          acknowledgeMessage,
                          client: i + 1,
                          group: 2,
                        });
                      },
                    ),
                  },
                  [event2]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ acknowledgeMessage }) => {
                        acknowledgeMessage();
                      },
                    ),
                  },
                },
                commands: {},
              }),
              currentClient.initializeConsumerGroup(group3, {
                events: {
                  [event1]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ message, acknowledgeMessage }) => {
                        handleMessage({
                          message,
                          acknowledgeMessage,
                          client: i + 1,
                          group: 3,
                        });
                      },
                    ),
                  },
                  [event2]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ acknowledgeMessage }) => {
                        acknowledgeMessage();
                      },
                    ),
                  },
                  [event3]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ acknowledgeMessage }) => {
                        acknowledgeMessage();
                      },
                    ),
                  },
                },
                commands: {},
              }),
            ]),
          ),
        )
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
        .catch(error => cleanupExtraClients().then(() => Promise.reject(error)))
    );
  });

  it('Should allow delivery when the sending client does not have a local consumer for the event', () => {
    const secondClient = createNewClient();

    const cleanupExtraClients = () => secondClient.close().then(() => {});

    const messageCount = 10;
    expect.assertions(messageCount + 1);
    return (
      new Promise(async (res, rej) => {
        const testMessage = 'remote consumer';

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
          events: {
            [event1]: {
              prefetch: 1,
              handler: async () => {},
            },
            [event2]: {
              prefetch: 1,
              handler: async () => {},
            },
            [event3]: {
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
          commands: {},
        });

        Promise.all(
          Array(messageCount)
            .fill()
            .map(() => client.sendEvent(event3, testMessage)),
        ).catch(rej);
      })
        // After the messages are all resolved we want to clean up the clients
        .then(cleanupExtraClients)
        .catch(error => cleanupExtraClients().then(() => Promise.reject(error)))
    );
  });

  it('Should not allow event consumers to receive commands with the same name', () => {
    const messageCount = 3;
    expect.assertions(messageCount);
    const testMessage = 'event not consumed by command handler';
    let messageCounter = 0;
    return new Promise((res, rej) => {
      client.initializeConsumerGroup(group1, {
        events: {
          [event1]: {
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
        commands: {},
      });

      client.initializeConsumerGroup(group4, {
        events: {},
        commands: {
          [event1]: {
            prefetch: 1,
            handler: async () => {
              rej(new Error('Command handler should not receive events'));
            },
          },
        },
      });

      clearGroup2AndGroup3(client);

      Promise.all(
        Array(messageCount)
          .fill()
          .map(() => client.sendEvent(event1, testMessage)),
      ).catch(rej);
    });
  });

  it('Should receive messages even if consumers are not active', () => {
    const messageCount = 30;
    expect.assertions(messageCount * 3 + 3);

    const secondClient = createNewClient();
    const thirdClient = createNewClient();

    const cleanupExtraClients = () =>
      Promise.all([secondClient.close(), thirdClient.close()]).then(() => {});

    return (
      new Promise(async (res, rej) => {
        const testMessage = 'once per group';
        const groupCounters = { 1: 0, 2: 0, 3: 0 };

        function handleMessage({ group, acknowledgeMessage, message }) {
          setTimeout(() => {
            expect(message).toEqual(testMessage);

            // Increment counters
            groupCounters[group] += 1;

            // Acknowledge the message
            acknowledgeMessage();

            // If all messages are done being delivered, wait for any extras and then run assertions
            if (
              messageCount === groupCounters[1] &&
              messageCount === groupCounters[2] &&
              messageCount === groupCounters[3]
            ) {
              setTimeout(() => {
                expect(groupCounters[1]).toEqual(messageCount);
                expect(groupCounters[2]).toEqual(messageCount);
                expect(groupCounters[3]).toEqual(messageCount);

                res();
              }, 100);
            }
          }, 20);
        }

        Promise.all(
          Array(messageCount)
            .fill()
            .map(() => client.sendEvent(event1, testMessage)),
        )
          .then(() =>
            Promise.all([
              client.initializeConsumerGroup(group1, {
                events: {
                  [event1]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ message, acknowledgeMessage }) => {
                        handleMessage({
                          message,
                          acknowledgeMessage,
                          group: 1,
                        });
                      },
                    ),
                  },
                },
                commands: {},
              }),
              client.initializeConsumerGroup(group2, {
                events: {
                  [event1]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ message, acknowledgeMessage }) => {
                        handleMessage({
                          message,
                          acknowledgeMessage,
                          group: 2,
                        });
                      },
                    ),
                  },
                  [event2]: {
                    prefetch: 1,
                    handler: async ({ acknowledgeMessage }) =>
                      acknowledgeMessage(),
                  },
                },
                commands: {},
              }),
              client.initializeConsumerGroup(group3, {
                events: {
                  [event1]: {
                    prefetch: 1,
                    handler: handlerTestEnhancer(
                      rej,
                      async ({ message, acknowledgeMessage }) => {
                        handleMessage({
                          message,
                          acknowledgeMessage,
                          group: 3,
                        });
                      },
                    ),
                  },
                  [event2]: {
                    prefetch: 1,
                    handler: async ({ acknowledgeMessage }) =>
                      acknowledgeMessage(),
                  },
                  [event3]: {
                    prefetch: 1,
                    handler: async ({ acknowledgeMessage }) =>
                      acknowledgeMessage(),
                  },
                },
                commands: {},
              }),
            ]),
          )
          .catch(rej);
      })
        // After the messages are all resolved we want to clean up the clients
        .then(cleanupExtraClients)
        .catch(error => cleanupExtraClients().then(() => Promise.reject(error)))
    );
  });
});
