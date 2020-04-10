// @flow
import type {
  ClientMethodsType,
  LoggerType,
  TopologyType,
  TopologyStateType,
  DeadLetterConfigInputType,
} from './types';

const Promise = require('bluebird');

const assertTopology = require('./assertTopology');
const {
  CarrotStiqsError,
  isValidConnectionUrls,
  isValidTopology,
  isValidDeadLetterConfig,
} = require('./util');
const createConnections = require('./createConnections');
const wrappedInitializeConsumerGroup = require('./wrappedInitializeConsumerGroup');
const wrappedSendMethods = require('./wrappedSendMethods');

// STEPS
// 0) Receive topology, expose initialize and publish functions
// 1) assert topology
// 2) create consumers, send pending messages

module.exports = function createCarrotStiqsClient({
  connectionUrls,
  disableRetryQueues = false,
  logger = console, // eslint-disable no-console
  topology,
  deadLetterConfig,
}: {|
  connectionUrls: Array<string>,
  deadLetterConfig: DeadLetterConfigInputType | false,
  disableRetryQueues?: boolean,
  logger: LoggerType,
  topology: TopologyType,
|}): ClientMethodsType {
  if (!isValidConnectionUrls(connectionUrls)) {
    throw new CarrotStiqsError('connectionUrls must be an array of strings.');
  }

  if (!isValidTopology(topology)) {
    throw new CarrotStiqsError(
      `topology must be an object, where every property has the following type: { events: ['string'], commands: ['string'] }. Either array may be empty.`,
    );
  }

  if (
    deadLetterConfig &&
    !isValidDeadLetterConfig(topology, deadLetterConfig)
  ) {
    throw new CarrotStiqsError(
      'the dead letter command name provided does not exist in the topology.',
    );
  }

  let dlConfig;
  const defaultDeadLetterConfig = {
    commandName: 'dead-letter',
    deadLetterRoutingKey: (queueName) => queueName,
    disableSendingToDLX: true,
  };

  // Disabling dead letter will only happen if false is specifically passed
  // in. Changing the default to also be false if that is the case.
  //
  // Else we combine the default with what is passed in, to ensure that if
  // keys are missing, it will still be set to the default.
  if (deadLetterConfig === false) {
    dlConfig = false;
  } else {
    dlConfig = Object.assign({}, defaultDeadLetterConfig, deadLetterConfig);
  }

  const { consumerConnection, publisherConnection } = createConnections(
    logger,
    connectionUrls,
  );

  // Topology will be asserted on startup before any consumers are created or messages are published
  // Prefetch numbers and consumers are configured when initializing consumers.
  // Events can be fanned out to multiple groups.
  // Commands are queues shared between all groups.

  //
  // Assert Topology
  //
  // Retrying until successful.
  // This could fail due to a conflicting topology or because we can't establish a connection.
  // The former would require human intervention so in the future I'd like to handle these cases separately.
  function retry(
    cb: () => Promise<void>,
    successCb: () => void,
    retryCount: number = 0,
  ) {
    cb()
      .then(() => successCb())
      .catch((error) => {
        const wait = Math.pow(2, retryCount <= 8 ? retryCount : 8);
        logger.error(
          `[CarrotStiqs] Asserting topology failed with the following error, will retry in ${wait} seconds.`,
          error,
        );
        setTimeout(() => retry(cb, successCb, retryCount + 1), wait * 1000);
      });
  }

  const topologyState = (function (): TopologyStateType {
    const state = { asserted: false, promise: Promise.resolve() };

    state.promise = new Promise((res) => {
      retry(
        () =>
          assertTopology({
            consumerConnection,
            logger,
            topology,
            disableRetryQueues,
            deadLetterConfig: dlConfig,
          }),
        () => {
          // We want to do this right away
          state.asserted = true;

          res();
        },
      );
    });

    return state;
  })();

  // Consumer state
  // We need this in order to avoid setting up duplicate consumers for a group
  // groupName = true if it setting up consumers is pending or successful
  // groupName = false if setting up consumers failed, isn't auto-retried currently
  // groupName = undefined if setting up consumers hasn't been attempted yet
  const consumerGroupHasBeenInitialized: {
    [groupName: string]: boolean | void,
  } = {};

  // We store all created channels here so we can close them before closing connections.
  const channels = [];

  const initializeConsumerGroup = wrappedInitializeConsumerGroup({
    channels,
    consumerConnection,
    consumerGroupHasBeenInitialized,
    disableRetryQueues,
    logger,
    publisherConnection,
    topology,
    topologyState,
  });

  const { sendCommand, sendEvent } = wrappedSendMethods({
    channels,
    logger,
    publisherConnection,
    topology,
    topologyState,
    deadLetterConfig: dlConfig,
  });

  return {
    close: () =>
      Promise.all(channels.map((c) => c.close()))
        .then(() =>
          Promise.all([
            consumerConnection.close(),
            publisherConnection.close(),
          ]),
        )
        .then(() => {}),
    initializeConsumerGroup,
    sendCommand,
    sendEvent,
    topologyState,
  };
};
