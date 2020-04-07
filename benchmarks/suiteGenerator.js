const { setupClient, command, event } = require('./setupClient');

const waitFor = ms => new Promise(res => setTimeout(res, ms));

module.exports = function({
  benchmark,
  msgCount,
  clientCount,
  delay,
  prefetch,
  msg: { label, payload },
}) {
  const suiteMutableState = {
    commandCounter: 0,
    group1EventCounter: 0,
    group2EventCounter: 0,
    group3EventCounter: 0,
    // These two are only used in benchmark suites
    cb: () => {},
    handlerDelay: 0,
  };

  function doWork() {
    // We use a timeout to emulate work, because all clients are running in the same process
    return suiteMutableState.handlerDelay > 0
      ? waitFor(suiteMutableState.handlerDelay)
      : Promise.resolve();
  }

  const clients = Array(clientCount)
    .fill()
    .map(() =>
      setupClient({
        prefetch,
        doWork,
        msgCount,
        suiteMutableState,
      }),
    );

  return Promise.all(clients.map(c => c.topologyState.promise)).then(() => {
    const suite = benchmark.createSuite(
      `${label} msg, ${
        delay ? delay + 'ms' : 'no'
      } delay, ${clientCount} clients, ${prefetch} prefetch`,
    );

    suiteMutableState.handlerDelay = delay;

    suite.add(`${msgCount} commands`, done => {
      suiteMutableState.commandCounter = 0;
      suiteMutableState.cb = done;

      // We are sending from 1 client which could be a disadvantage
      Array(msgCount)
        .fill()
        .map(() => clients[0].sendCommand(command, payload));
    });

    suite.add(`${msgCount} events, 3 consumer groups`, done => {
      suiteMutableState.group1EventCounter = 0;
      suiteMutableState.group2EventCounter = 0;
      suiteMutableState.group3EventCounter = 0;
      suiteMutableState.cb = done;

      // We are sending from 1 client which could be a disadvantage
      Array(msgCount)
        .fill()
        .map(() => clients[0].sendEvent(event, payload));
    });

    return {
      suite,
      teardown: () => Promise.all(clients.map(c => c.close())),
    };
  });
};
