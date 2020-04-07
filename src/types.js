// @flow
import type { Message, PublishOptions } from 'amqplib';

export type MessageHandlerParamType = {|
  acknowledgeMessage: () => void,
  delayedRetryMessage?: (
    delay: number,
    options: PublishOptions,
  ) => Promise<void>,
  discardMessage: () => void,
  message: string,
  messageObject: Message,
  retryMessage: () => void,
|};

export type MessageHandlerWithFailMessageParamType = MessageHandlerParamType & {|
  failMessage: () => void,
|};

export type MessageHandlerType = (
  obj: MessageHandlerParamType,
) => Promise<void>;

export type MessageHandlerConfigType = {|
  handler: MessageHandlerType,
  onEmpty?: () => void,
  prefetch: number,
|};

export type InitializeConsumerGroupConfigType = {|
  commands: {|
    [destination: string]: MessageHandlerConfigType,
  |},
  events: {|
    [destination: string]: MessageHandlerConfigType,
  |},
|};

/* eslint-disable flowtype/require-exact-type, flowtype/no-weak-types*/
export type LoggerType = {
  +error: (...args: Array<any>) => void,
  +log: (...args: Array<any>) => void,
  +warn: (...args: Array<any>) => void,
};
/* eslint-enable flowtype/require-exact-type, flowtype/no-weak-types*/

export type TopologyItemType = {|
  commands: Array<string>,
  events: Array<string>,
|};

// eslint-disable-next-line flowtype/require-exact-type
export type TopologyType = {
  [groupName: string]: TopologyItemType,
};

export type DeadLetterConfigInputType = {|
  commandName: string,
  deadLetterRoutingKey?: (queueName: string) => string,
  disableSendingToDLX?: boolean,
|};

export type DeadLetterConfigSafeType = {|
  commandName: string,
  deadLetterRoutingKey: (queueName: string) => string,
  disableSendingToDLX: boolean,
|};

export type TopologyStateType = {|
  asserted: boolean,
  promise: Promise<void>,
|};

export type ClientMethodsType = {|
  close: () => Promise<void>,
  initializeConsumerGroup: (
    groupName: string,
    InitializeConsumerGroupConfigType,
  ) => Promise<void>,
  sendCommand: (
    destination: string,
    message: string,
    options: PublishOptions,
  ) => Promise<mixed>,
  sendEvent: (
    destination: string,
    message: string,
    options: PublishOptions,
  ) => Promise<mixed>,
  topologyState: TopologyStateType,
|};
