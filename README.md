## CarrotStiqs

> A declarative API for asynchronous messaging with RabbitMQ.

```bash
$ npm i carrotstiqs
```

### Highlights
- Two message types:
  - Commands: Each message is processed successfully (at least) **once** and is load balanced across consumers.
  - Events: Each message is processed successfully (at least) **once per consumer group** and is load balanced across consumers.
- Consumer Groups: Declare which events and commands they will consume. Any group can send any event or command. If multiple groups subscribe to an event A, each consumer group will receive all future "A" events.
- Shared topology for all clients. This protects against message loss in the case that one client is publishing before other clients have asserted their queues.
- Discover common issues quickly during development:
  - Misspellings of consumer group name, events, and commands
  - Forgetting to consume messages for a registered command/event
- Reliably delivers message regardless of client crashes, AMQP broker crashes, or network otuuages


### Assumptions
- Fault-tolerance/resilience over throughput
- Prefer "at least once delivery"
- Prefer publish confirmation
- Prefer ack mode on consumers
- Using RabbitMQ (Other implementations of AMQP may work, but are not supported)


### API Walkthrough
> For more detailed information about types or behaviors please review the types in the source code or the tests, respectively.

**Topology**
The topology object has a key with the name of each consumer group, and each group declares the events and commands it will be consuming.
```js
const topology = {
  email: {
    events: ['userInfoChanged'],
    commands: [],
  },
  user: {
    events: [],
    commands: ['changeContactInfo'],
  },
};
```

**Client**
The library's main export is a function that receives the topology and connection urls. The client it returns has methods for sending and consuming messages.

Creating a client may synchronously throw validation errors.
```js
const createCarrotStiqsClient = require('./carrotstiqs');
const client = createCarrotStiqsClient({
  topology,
  connectionUrls: ["amqp://guest:guest@localhost:5672"],
});
```


**Consume messages**
Prefetch count and handlers are set when initializing consumers.

Handlers receive a string representation of the message, the original `amqplib` msg object, and functions to ack, nack w/ requeue, or nack w/o requeue. The first invocation of any of these functions will take effect and all future invocations are noops. This avoids bringing down a channel by acking twice, or both acking and nacking.

A considerable amount of validation happens when declaring consumers in order to detect problems such as missing handlers or typos.
```js
client.initializeConsumerGroup('email', {
  events: {
    userInfoChanged: {
      prefetch: 1,
      handler: async ({ message, messageObject, acknowledgeMessage, discardMessage, retryMessage }) => {
        try {
          const data = JSON.parse(message);

          // Send email
          await sendUserInfoChangedEmail(data);

          acknowledgeMessage();
        } catch (e) {
          // Discard message if JSON parsing failed or it has already been delivered once
          if (e instanceof SyntaxError || messageObject.fields.redelivered) {
            discardMessage();
          }

          // Try once more
          retryMessage();
        }
      }
    }
  }
});
```


**Send messages**
Both sendCommand and sendEvent return promises that resolve when the message was confirmed by RabbitMQ, or reject if the message could not be delivered successfully.

If a message was sent while there was no connection to RabbitMQ or before topology was fully asserted, they will be queued in memory.
```js
client.sendCommand('changeContactInfo', JSON.stringify({ fakeData: true }));
client.sendEvent('userInfoChanged', JSON.stringify({ fakeData: true }));
```

**Close client**
The close method closes all channels and connections. It will resolve when everything has been shut down.
```js
client.close();
```


### Best practices
Each process can have multiple clients, though this probably isn't optimal. If you desire more concurrency it probably would be better to tweak the prefetch number instead.

If prefetch is greater than one or there is more than one consumer for a command or grouped event, message processing guarantees go out the window. Because of the ordering characteristic and the library's at-least-once delivery preference, it is recommended to make your handlers safe for duplicate and out-of-order deliveries.


### Performance
Some benchmarks have been written for this library. They can be run with `npm run benchmark`, or you can view past results from a local test [here](./benchmarks/index.js)


### Acknowledgements
This library was inspired in part by [rabbot](https://github.com/arobson/rabbot/) and [moleculer](https://github.com/moleculerjs/moleculer).
Originally authored by Nathan Schwartz and Taylor King as part of their work on the Merlin Platform.


### Enhancement ideas
- Check for special RabbitMQ characters in event and command names
- Allow full connection objects (socketOptions) to be passed to amqp-connection-manager
- Identify and manage slow connsumers
- Streamline testing approach and write more integration tests
- Delete queues and exchanges between test suites instead of running a temp client
- Support earlier Node versions
- Version exchanges and queues
- Introduce "strict mode", which defaults to true. Opting out would bypass most validations
- Ack batching like [rabbot](https://github.com/arobson/rabbot/)
