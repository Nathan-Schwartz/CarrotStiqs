// @flow
import type { LoggerType } from './types';

const amqp = require('amqp-connection-manager');

const { logConnectionEvents } = require('./util');

module.exports = function createConnections(
  logger: LoggerType,
  connectionUrls: Array<string>,
): {| consumerConnection: *, publisherConnection: * |} {
  // Create our managed connections
  const publisherConnection = amqp.connect(connectionUrls);
  const consumerConnection = amqp.connect(connectionUrls);

  // Handle connection events
  logConnectionEvents('consumer', consumerConnection, logger);
  logConnectionEvents('publisher', publisherConnection, logger);

  return { publisherConnection, consumerConnection };
};
