// @flow
import type EventEmitter from 'events';

import type { LoggerType } from './types';

const ExtendableError = require('es6-error');

//
// Log Channel and Connection events
//
function logConnectionEvents(
  name: string,
  connection: EventEmitter,
  logger: LoggerType,
) {
  const events = ['blocked', 'unblocked', 'disconnect', 'connect'];
  events.forEach((event) => {
    connection.on(event, (data) => {
      if (data) {
        const clone = Object.assign({}, data);
        delete clone.connection;
        delete clone.url;
        logger.log(
          `[CarrotStiqs] Connection ${name} got event: ${event}`,
          clone,
        );
      } else {
        logger.log(`[CarrotStiqs] Connection ${name} got event: ${event}`);
      }
    });
  });
}

function logChannelEvents(
  name: string,
  channel: EventEmitter,
  logger: LoggerType,
) {
  const events = ['error', 'close', 'connect', 'drain'];
  events.forEach((event) => {
    channel.on(event, (error, data) => {
      if (event === 'error') {
        logger.log(
          `[CarrotStiqs] Connection ${name} got event: ${event}`,
          Object.assign({ error }, data),
        );
      } else {
        logger.log(`[CarrotStiqs] Connection ${name} got event: ${event}`);
      }
    });
  });
}

//
// Topology checks
//
// eslint-disable-next-line flowtype/no-weak-types
const isValidConnectionUrls = (connectionUrls: any): boolean =>
  Array.isArray(connectionUrls) &&
  connectionUrls.length > 0 &&
  connectionUrls.every((c) => typeof c === 'string');

// eslint-disable-next-line flowtype/no-weak-types
const isValidTopology = (topology: any): boolean => {
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
    return false;
  }

  // eslint-disable-next-line flowtype/no-weak-types
  const isValidCommandOrEvent = (arr: any): boolean =>
    Array.isArray(arr) && arr.every((c) => typeof c === 'string');

  return Object.keys(topology).every((groupName) => {
    const group = topology[groupName];
    if (!group || typeof group !== 'object') return false;

    return (
      isValidCommandOrEvent(group.events) &&
      isValidCommandOrEvent(group.commands)
    );
  });
};

// eslint-disable-next-line flowtype/no-weak-types
const isValidDeadLetterConfig = (topology: any, config: any): boolean => {
  if (config.commandName) {
    return Object.keys(topology).some((groupName) =>
      topology[groupName].commands.some(
        (command) => command === config.commandName,
      ),
    );
  }

  return true;
};

//
// Error to be used for CarrotStiqs level errors
//
class CarrotStiqsError extends ExtendableError {
  constructor(msg: string) {
    super(msg);
    this.name = 'CarrotStiqsError';
  }
}

//
// Retry Queue helpers
//
const numberOfQueues = 25;

// Maxiumum amount of time a message could be delayed with this number of retry queues
const maxDelay = Math.pow(2, numberOfQueues) - 1;

const getTopicForWaitTime = (wait: number) => {
  const binaryString = wait.toString(2);

  const missingDigits = numberOfQueues - binaryString.length;

  let prefix = '';
  for (var i = 0; i < missingDigits; i++) {
    prefix += 0;
  }

  return (prefix + binaryString).replace(/1/g, '1.').replace(/0/g, '0.');
};

const getRetryName = (number: number) => {
  // We do -1 here because the first level should start at 1 (2^0)
  const messageTtl = Math.pow(2, number - 1) * 1000;
  const name = `retry.level-${number}`;
  return { messageTtl, name };
};

const buildPattern = (num: number, wait: boolean = true) => {
  const arr = Array(numberOfQueues).fill('*');
  arr[num - 1] = wait ? '1' : '0';
  arr.reverse();
  return arr.join('.') + '.#';
};

module.exports = {
  CarrotStiqsError,
  buildPattern,
  getRetryName,
  getTopicForWaitTime,
  isValidConnectionUrls,
  isValidTopology,
  isValidDeadLetterConfig,
  logChannelEvents,
  logConnectionEvents,
  maxDelay,
  numberOfQueues,
};
