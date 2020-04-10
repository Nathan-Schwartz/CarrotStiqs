const createCarrotStiqsClient = require('../src/carrotstiqs');
const { CarrotStiqsError } = require('../src/util');

const topology = {
  validationA: {
    events: ['validationEvent'],
    commands: ['validationCommand'],
  },
  validationB: {
    events: ['validationEvent'],
    commands: [],
  },
  validationC: {
    events: [],
    commands: ['validationCommand'],
  },
  validationD: {
    events: [],
    commands: [],
  },
};

const connectionUrls = [
  process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672',
];

const createNewClient = () =>
  createCarrotStiqsClient({
    connectionUrls,
    logger: { log: () => {}, error: () => {}, warn: () => {} },
    topology,
  });

describe('Validations', () => {
  let client = createNewClient();

  // We wait in order to avoid inconsistent errors closing channels.
  beforeEach(() => {
    return client.close().then(() => {
      client = createNewClient();
    });
  });

  afterAll(() => {
    return client.close();
  });

  it("Should throw if topology isn't valid", async () => {
    expect.assertions(8);

    try {
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => {}, error: () => {}, warn: () => {} },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    }

    try {
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology: [], // not an object
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    }

    try {
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology: { fakeGroup: { events: [] } }, // forgot commands
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    }

    try {
      createCarrotStiqsClient({
        connectionUrls,
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology: { fakeGroup: { events: [{}], commands: [{}] } }, // arrays should have strings in them
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    }
  });

  it("Should throw if connectionUrls isn't valid", async () => {
    expect.assertions(6);

    try {
      createCarrotStiqsClient({
        connectionUrls: [], // must have at least one url
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    }

    try {
      createCarrotStiqsClient({
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    }

    try {
      createCarrotStiqsClient({
        connectionUrls: [{ url: '' }], // not an accepted format
        logger: { log: () => {}, error: () => {}, warn: () => {} },
        topology,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    }
  });

  it("Should reject if group name doesn't exist in topology", async () => {
    expect.assertions(2);

    return client
      .initializeConsumerGroup('notagroup', { events: {}, commands: {} })
      .catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      });
  });

  it('Should reject if sending to dead letter command is disabled', async () => {
    expect.assertions(1);
    const disableSendingClient = createCarrotStiqsClient({
      connectionUrls,
      logger: { log: () => {}, error: () => {}, warn: () => {} },
      topology: {
        'post-mortem': {
          commands: ['dead-letter'],
          events: [],
        },
      },
    });

    return new Promise((res, rej) => {
      return disableSendingClient
        .initializeConsumerGroup('post-mortem', {
          events: {},
          commands: {
            'dead-letter': {
              prefetch: 1,
              handler: () => {},
            },
          },
        })
        .then(() => {
          client.sendCommand('dead-letter', 'will be rejected').catch((err) => {
            expect(err).toBeInstanceOf(CarrotStiqsError);
            res();
          });
        })
        .catch(rej);
    }).then(() => disableSendingClient.close());
  });

  it('Should reject if any of the registered events for a group are not consumed', () => {
    expect.assertions(2);

    return client
      .initializeConsumerGroup('validationB', {
        events: {},
        commands: {},
      })
      .catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      });
  });

  it('Should reject if any of the registered commands for a group are not consumed', () => {
    expect.assertions(2);

    return client
      .initializeConsumerGroup('validationC', {
        events: {},
        commands: {},
      })
      .catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      });
  });

  it('Should reject if a group attempts to consume events it has not registered for', () => {
    expect.assertions(2);

    return client
      .initializeConsumerGroup('validationD', {
        events: { notathing: { prefetch: 1, handler: async () => {} } },
        commands: {},
      })
      .catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      });
  });

  it('Should reject if a group attempts to consume commands it has not registered for', () => {
    expect.assertions(2);

    return client
      .initializeConsumerGroup('validationD', {
        events: {},
        commands: {
          notathing: {
            prefetch: 1,
            handler: async () => {},
          },
        },
      })
      .catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      });
  });

  it('Should reject if attempting to send an event as a command', () => {
    expect.assertions(2);
    return client.sendCommand('validationEvent', 'payload').catch((err) => {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    });
  });

  it('Should reject if attempting to send a command as an event', () => {
    expect.assertions(2);
    return client.sendEvent('validationCommand', 'payload').catch((err) => {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    });
  });

  it('Should reject if attempting to consume an event as a command', () => {
    expect.assertions(2);
    return client
      .initializeConsumerGroup('validationB', {
        events: {
          validationEvent: {
            prefetch: 1,
            handler: async () => {},
          },
        },
        commands: {
          validationEvent: {
            prefetch: 1,
            handler: async () => {},
          },
        },
      })
      .catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      });
  });

  it('Should reject if attempting to consume a command as an event', () => {
    expect.assertions(2);
    return client
      .initializeConsumerGroup('validationC', {
        events: {
          validationCommand: {
            prefetch: 1,
            handler: async () => {},
          },
        },
        commands: {
          validationCommand: {
            prefetch: 1,
            handler: async () => {},
          },
        },
      })
      .catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      });
  });

  it('Should reject if attempting to send events that are not registered', () => {
    expect.assertions(2);

    return client.sendEvent('notathing', 'payload').catch((err) => {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    });
  });

  it('Should reject if attempting to send commands that are not registered', () => {
    expect.assertions(2);

    return client.sendCommand('notathing', 'payload').catch((err) => {
      expect(err).toBeInstanceOf(CarrotStiqsError);
      expect(err.message).toMatchSnapshot();
    });
  });

  it('Should throw if event payload is not a string or Buffer', () => {
    expect.assertions(8);

    return Promise.all([
      client.sendEvent('validationEvent', undefined).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
      client.sendEvent('validationEvent', null).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
      client.sendEvent('validationEvent', {}).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
      client.sendEvent('validationEvent', []).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
    ]);
  });

  it('Should throw if command payload is not a string or Buffer', () => {
    expect.assertions(8);

    return Promise.all([
      client.sendCommand('validationCommand', undefined).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
      client.sendCommand('validationCommand', null).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
      client.sendCommand('validationCommand', {}).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
      client.sendCommand('validationCommand', []).catch((err) => {
        expect(err).toBeInstanceOf(CarrotStiqsError);
        expect(err.message).toMatchSnapshot();
      }),
    ]);
  });
});
