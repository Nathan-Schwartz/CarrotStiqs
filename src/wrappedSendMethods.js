// @flow
import type { PublishOptions } from 'amqplib';

import type {
  LoggerType,
  TopologyType,
  TopologyItemType,
  TopologyStateType,
  DeadLetterConfigSafeType,
} from './types';

const curry = require('lodash.curry');
const Promise = require('bluebird');

const { logChannelEvents, CarrotStiqsError } = require('./util');

function wrappedSendMethods({
  channels,
  logger,
  publisherConnection,
  topology,
  topologyState,
  deadLetterConfig,
}: {
  channels: Array<*>,
  deadLetterConfig: DeadLetterConfigSafeType | boolean,
  logger: LoggerType,
  publisherConnection: *,
  topology: TopologyType,
  topologyState: TopologyStateType,
}): {|
  sendCommand: (destination: string, message: string) => Promise<mixed>,
  sendEvent: (destination: string, message: string) => Promise<mixed>,
|} {
  // These are used in the send method for sanity checking
  const eventMap: { [event: string]: true } = Object.keys(topology)
    .map(groupName => topology[groupName])
    .reduce((acc, group: TopologyItemType) => {
      acc = acc.concat(group.events);
      return acc;
    }, [])
    // dedupe events
    .filter((a, i, c) => c.indexOf(a) === i)
    .reduce((acc, event) => {
      acc[event] = true;
      return acc;
    }, {});

  const commandMap: { [command: string]: true } = Object.keys(topology)
    .map(groupName => topology[groupName])
    .reduce((acc, group: TopologyItemType) => {
      acc = acc.concat(group.commands);
      return acc;
    }, [])
    // dedupe commands
    .filter((a, i, c) => c.indexOf(a) === i)
    .reduce((acc, command) => {
      acc[command] = true;
      return acc;
    }, {});

  // Store all events and commands that were sent before we asserted the topology.
  const offlineEvents = [];
  const offlineCommands = [];

  // Send all pending events and commands after topology is asserted
  topologyState.promise.then(() => {
    offlineEvents.map(event => {
      sendEvent(event.destination, event.message, event.options)
        .then(event.res)
        .catch(event.rej);
    });

    offlineCommands.map(command => {
      sendCommand(command.destination, command.message, command.options)
        .then(command.res)
        .catch(command.rej);
    });
  });

  //
  // Publisher setup
  //
  const publisherChannel = publisherConnection.createChannel({
    setup: function() {},
  });

  channels.push(publisherChannel);

  logChannelEvents('publisher', publisherChannel, logger);

  const sendEvent = curry(
    (
      destination: string,
      message: string | Buffer,
      options: PublishOptions = {},
    ): Promise<void> => {
      if (typeof message !== 'string' && !Buffer.isBuffer(message)) {
        return Promise.reject(
          new CarrotStiqsError('Message must be a string or Buffer.'),
        );
      }

      if (!eventMap[destination]) {
        return Promise.reject(
          new CarrotStiqsError(
            `This event does not exist in the topology: ${destination}`,
          ),
        );
      }

      if (!topologyState.asserted) {
        return new Promise((res, rej) => {
          offlineEvents.push({ destination, message, options, res, rej });
        });
      }

      return publisherChannel
        .publish(`event.${destination}`, '', Buffer.from(message), {
          persistent: true,
          ...options,
        })
        .then(() => {});
    },
    2,
  );

  const sendCommand = curry(
    (
      destination: string,
      message: string | Buffer,
      options: PublishOptions = {},
    ): Promise<void> => {
      if (
        typeof deadLetterConfig === 'object' &&
        deadLetterConfig.disableSendingToDLX &&
        destination === deadLetterConfig.commandName
      ) {
        return Promise.reject(
          new CarrotStiqsError('Sending to dead letter has been disabled.'),
        );
      }

      if (typeof message !== 'string' && !Buffer.isBuffer(message)) {
        return Promise.reject(
          new CarrotStiqsError('Message must be a string or Buffer.'),
        );
      }

      if (!commandMap[destination]) {
        return Promise.reject(
          new CarrotStiqsError(
            `This command does not exist in the topology: ${destination}`,
          ),
        );
      }

      if (!topologyState.asserted) {
        return new Promise((res, rej) => {
          offlineCommands.push({ destination, message, options, res, rej });
        });
      }

      return publisherChannel
        .publish(`command.${destination}`, '', Buffer.from(message), {
          persistent: true,
          ...options,
        })
        .then(() => {});
    },
    2,
  );

  return {
    sendCommand,
    sendEvent,
  };
}
module.exports = wrappedSendMethods;
