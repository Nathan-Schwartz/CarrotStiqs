// @flow
import type { ConfirmChannel } from 'amqplib';

import type {
  LoggerType,
  TopologyType,
  DeadLetterConfigSafeType,
} from './types';

const {
  numberOfQueues,
  getRetryName,
  buildPattern,
  logChannelEvents,
} = require('./util');

const retryEntry = 'retry.entry';
const retryExit = 'retry.exit';

//
// Assert Topology
//
function assertTopology({
  consumerConnection,
  disableRetryQueues,
  logger,
  topology,
  deadLetterConfig,
}: {|
  consumerConnection: *,
  deadLetterConfig: DeadLetterConfigSafeType | boolean,
  disableRetryQueues: boolean,
  logger: LoggerType,
  topology: TopologyType,
|}): Promise<void> {
  return new Promise((res, rej) => {
    // We create a channel just to assert the topology and then close it
    // We assign channel to a ref so that it can be closed properly from within setup function
    const ref = { channel: null };
    ref.channel = consumerConnection.createChannel({
      setup: async function (channel: ConfirmChannel): Promise<void> {
        // We use a lot of Promise.alls because a significant amount of the assertions can be done concurrently

        if (!disableRetryQueues) {
          await Promise.all(
            Array(numberOfQueues)
              .fill()
              .map((_, index) => {
                const { messageTtl, name } = getRetryName(index + 1);
                const { name: nextLevelName } = getRetryName(index + 2);

                return Promise.all([
                  channel.assertExchange(name, 'topic'),
                  channel.assertQueue(name, {
                    messageTtl,
                    durable: true,
                    deadLetterExchange: nextLevelName,
                  }),
                ]);
              }),
          );

          const { name: firstName } = getRetryName(1);
          await channel.assertExchange(retryEntry, 'topic');
          await channel.bindExchange(firstName, retryEntry, '#');

          // We use numberOfQueues + 1 here because we'll end up with one that doesn't have a corresponding queue,
          // but will be routed to due to the above logic.
          const { name: lastName } = getRetryName(numberOfQueues + 1);
          await channel.assertExchange(lastName, 'topic');
          await channel.assertExchange(retryExit, 'topic');
          await channel.bindExchange(retryExit, lastName, '#');

          await Promise.all(
            Array(numberOfQueues)
              .fill()
              .map((_, index) => {
                const { name } = getRetryName(index + 1);
                const { name: nextLevelName } = getRetryName(index + 2);

                return Promise.all([
                  channel.bindQueue(name, name, buildPattern(index + 1, true)),
                  channel.bindExchange(
                    nextLevelName,
                    name,
                    buildPattern(index + 1, false),
                  ),
                ]);
              }),
          );
        }

        return Promise.all(
          Object.keys(topology).map((groupName) => {
            const group = topology[groupName];

            return Promise.all([
              Promise.all(
                group.events.map((event) => {
                  const namespacedEvent = `event.${event}`;
                  const namespacedGroupedEvent = `event.${groupName}.${event}`;
                  const queueOptions = {};

                  if (
                    deadLetterConfig &&
                    typeof deadLetterConfig === 'object'
                  ) {
                    const {
                      commandName,
                      deadLetterRoutingKey,
                    } = deadLetterConfig;

                    const deadLetterRoutingKeyName = deadLetterRoutingKey(
                      namespacedGroupedEvent,
                    );

                    queueOptions.deadLetterExchange = `command.${commandName}`;
                    queueOptions.deadLetterRoutingKey = deadLetterRoutingKeyName;
                  }

                  return Promise.all([
                    channel.assertExchange(namespacedEvent, 'fanout'),
                    channel.assertExchange(namespacedGroupedEvent, 'fanout'),
                    channel.assertQueue(
                      namespacedGroupedEvent,
                      Object.assign({}, queueOptions, {
                        durable: true,
                      }),
                    ),
                  ]).then(() => {
                    const pArr = [
                      channel.bindExchange(
                        namespacedGroupedEvent,
                        namespacedEvent,
                        '',
                      ),
                      channel.bindQueue(
                        namespacedGroupedEvent,
                        namespacedGroupedEvent,
                        '',
                      ),
                    ];

                    if (!disableRetryQueues) {
                      pArr.push(
                        channel.bindExchange(
                          namespacedGroupedEvent,
                          retryExit,
                          `#.${namespacedGroupedEvent}`,
                        ),
                      );
                    }

                    return Promise.all(pArr);
                  });
                }),
              ),
              Promise.all(
                group.commands.map((command) => {
                  const namespacedCommand = `command.${command}`;
                  const queueOptions = {};

                  if (
                    deadLetterConfig &&
                    typeof deadLetterConfig === 'object'
                  ) {
                    const {
                      deadLetterRoutingKey,
                      commandName,
                    } = deadLetterConfig;

                    if (commandName !== command) {
                      const deadLetterRoutingKeyName = deadLetterRoutingKey(
                        namespacedCommand,
                      );

                      queueOptions.deadLetterExchange = `command.${commandName}`;
                      queueOptions.deadLetterRoutingKey = deadLetterRoutingKeyName;
                    }
                  }

                  return Promise.all([
                    channel.assertExchange(namespacedCommand, 'fanout'),
                    channel.assertQueue(
                      namespacedCommand,
                      Object.assign({}, queueOptions, {
                        durable: true,
                      }),
                    ),
                  ]).then(() => {
                    const pArr = [
                      channel.bindQueue(
                        namespacedCommand,
                        namespacedCommand,
                        '',
                      ),
                    ];

                    if (!disableRetryQueues) {
                      pArr.push(
                        channel.bindExchange(
                          namespacedCommand,
                          retryExit,
                          `#.${namespacedCommand}`,
                        ),
                      );
                    }

                    return Promise.all(pArr);
                  });
                }),
              ),
            ]);
          }),
        )
          .then(() => res())
          .catch(rej)
          .then(() => {
            if (ref.channel) {
              return ref.channel.close();
            }
          });
      },
    });

    logChannelEvents('topologyAsserter', ref.channel, logger);
  });
}

module.exports = assertTopology;
