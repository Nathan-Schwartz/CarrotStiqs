// @flow
import type { ConfirmChannel, Message, PublishOptions } from 'amqplib';

import type {
  InitializeConsumerGroupConfigType,
  MessageHandlerConfigType,
  MessageHandlerParamType,
  LoggerType,
  MessageHandlerType,
  TopologyStateType,
  TopologyType,
} from './types';

const Promise = require('bluebird');

const {
  CarrotStiqsError,
  getTopicForWaitTime,
  logChannelEvents,
  maxDelay,
} = require('./util');

function wrappedInitializeConsumerGroup({
  channels,
  consumerConnection,
  consumerGroupHasBeenInitialized,
  disableRetryQueues,
  logger,
  publisherConnection,
  topology,
  topologyState,
}: {|
  channels: Array<*>,
  consumerConnection: *,
  consumerGroupHasBeenInitialized: { [groupName: string]: boolean | void },
  disableRetryQueues: boolean,
  logger: LoggerType,
  publisherConnection: *,
  topology: TopologyType,
  topologyState: TopologyStateType,
|}): * {
  //
  // Publisher setup
  //
  const publisherChannel = publisherConnection.createChannel({
    setup: function () {},
  });

  channels.push(publisherChannel);

  //
  // Consumer setup
  //
  return async function initializeConsumerGroup(
    groupName: string,
    { commands, events }: InitializeConsumerGroupConfigType,
  ): Promise<void> {
    if (consumerGroupHasBeenInitialized[groupName]) {
      logger.warn(
        '[CarrotStiqs] Attempted to create consumers but they already exist. This is a noop.',
      );
      return Promise.resolve();
    } else {
      consumerGroupHasBeenInitialized[groupName] = true;
    }

    //
    // Validation
    //
    const groupConfig = topology[groupName];
    if (!groupConfig) {
      throw new CarrotStiqsError(
        `Attempted to setup consumers for unregistered group: ${groupName}`,
      );
    }

    const missingEvents = groupConfig.events.filter((event) => !events[event]);
    const missingCommands = groupConfig.commands.filter(
      (command) => !commands[command],
    );
    const extraneousEvents = Object.keys(events).filter(
      (event) => !groupConfig.events.includes(event),
    );
    const extraneousCommands = Object.keys(commands).filter(
      (command) => !groupConfig.commands.includes(command),
    );

    if (extraneousEvents.length > 0) {
      throw new CarrotStiqsError(
        `Group ${groupName} attempted to consume events that were not registered for this group in the topology: ${extraneousEvents.join(
          ' ',
        )}`,
      );
    }

    if (extraneousCommands.length > 0) {
      throw new CarrotStiqsError(
        `Group ${groupName} attempted to consume commands that were not registered for this group in the topology: ${extraneousCommands.join(
          ' ',
        )}`,
      );
    }

    if (missingEvents.length > 0) {
      throw new CarrotStiqsError(
        `Group ${groupName} did not provide a handler for events that were registered for this group in the toplogy: ${missingEvents.join(
          ' ',
        )}`,
      );
    }

    if (missingCommands.length > 0) {
      throw new CarrotStiqsError(
        `Group ${groupName} did not provide a handler for commands that were registered for this group in the toplogy: ${missingCommands.join(
          ' ',
        )}`,
      );
    }

    const handlerMiddleware = (
      handler: MessageHandlerType,
      channel: ConfirmChannel,
      key: string,
      queueName: string,
    ) => (message: Message | void | null) => {
      // We have to do this check inside of the handlers too,
      // because Flow knows that theoretically the message could be mutated before a handler is invoked
      if (message === null || message === undefined) {
        return;
      }

      let handled = false;
      const handlerArgs: MessageHandlerParamType = {
        message: message.content.toString(),
        messageObject: message,
        acknowledgeMessage: () => {
          // This check is necessary because Flow knows that theoretically the message could be mutated before these functions are invoked
          if (!handled && message !== null && message !== undefined) {
            channel.ack(message);
            handled = true;
          }
        },
        retryMessage: () => {
          if (!handled && message !== null && message !== undefined) {
            channel.reject(message, true);
            handled = true;
          }
        },
        discardMessage: () => {
          if (!handled && message !== null && message !== undefined) {
            channel.reject(message, false);
            handled = true;
          }
        },
      };

      if (!disableRetryQueues) {
        handlerArgs.delayedRetryMessage = (
          delay: number,
          options: PublishOptions = {},
        ) => {
          if (!handled && message !== null && message !== undefined) {
            const backoffRoutingKey = getTopicForWaitTime(
              delay > maxDelay ? maxDelay : delay,
            );

            const retryCount = message.properties.headers.retryCount || 0;

            handled = true;
            return publisherChannel
              .publish(
                'retry.entry',
                `${backoffRoutingKey}${queueName}`,
                message.content,
                {
                  persistent: true,
                  ...options,
                  headers: {
                    retryCount: retryCount + 1,
                    ...(options.headers || {}),
                  },
                },
              )
              .then(() => {
                if (message !== null && message !== undefined) {
                  channel.ack(message);
                }
              })
              .catch((err) => {
                handled = false;
                throw err;
              });
          }

          return Promise.resolve();
        };
      }

      return handler(handlerArgs).catch((err) => {
        if (message !== null && message !== undefined) {
          channel.reject(message, false);
        }
        logger.error(
          `[CarrotStiqs] ${key} handler for ${groupName} rejected. The message it was processing was discarded as the handler was unable to process it correctly, and redelivery is unlikely to succeed.`,
          `\nError:`,
          err,
          '\nmessage:',
          message,
        );
      });
    };

    function setupConsumers(
      config: { [string]: MessageHandlerConfigType },
      getQueue: (string) => string,
    ): Promise<*> {
      return Promise.all(
        Object.keys(config).map((key) => {
          const { prefetch, handler } = config[key];

          const channelWrapper = consumerConnection.createChannel({
            setup: function (channel: ConfirmChannel): Promise<void> {
              channel.prefetch(prefetch);

              return channel
                .consume(
                  getQueue(key),
                  handlerMiddleware(
                    Promise.method(handler),
                    channel,
                    key,
                    getQueue(key),
                  ),
                  { noAck: false },
                )
                .catch((err) =>
                  logger.error(`Consuming ${getQueue(key)} failed:`, err),
                );
            },
          });

          channels.push(channelWrapper);

          logChannelEvents(key, channelWrapper, logger);
        }),
      );
    }

    return topologyState.promise
      .then(() =>
        Promise.all([
          setupConsumers(events, (event) => `event.${groupName}.${event}`),
          setupConsumers(commands, (command) => `command.${command}`),
        ]),
      )
      .then(() => {
        consumerGroupHasBeenInitialized[groupName] = true;
      })
      .catch((err) => {
        logger.error(
          '[CarrotStiqs] Error setting up consumers, this will not be automatically retried.',
          err,
        );
        consumerGroupHasBeenInitialized[groupName] = false;
        throw err;
      });
  };
}

module.exports = wrappedInitializeConsumerGroup;
