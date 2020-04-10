const handlerTestEnhancer = (rej, fn) => async (data) => {
  try {
    await fn(data);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('handler throw:', e);
    rej(e);
    throw e;
  }
};

const clearAllMessages = (createNewClient, topology) => {
  return new Promise(async (res, rej) => {
    try {
      const client = createNewClient();
      const messageHandler = async ({ acknowledgeMessage }) =>
        acknowledgeMessage();

      await Promise.all(
        Object.keys(topology).map((group) =>
          client.initializeConsumerGroup(group, {
            events: topology[group].events.reduce((acc, event) => {
              acc[event] = {
                prefetch: 100,
                handler: messageHandler,
              };
              return acc;
            }, {}),

            commands: topology[group].commands.reduce((acc, command) => {
              acc[command] = {
                prefetch: 100,
                handler: messageHandler,
              };
              return acc;
            }, {}),
          }),
        ),
      );

      setTimeout(() => client.close().then(res).catch(rej), 100);
    } catch (e) {
      rej(e);
    }
  });
};

module.exports = {
  clearAllMessages,
  handlerTestEnhancer,
};
