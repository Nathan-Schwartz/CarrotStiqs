#!/usr/bin/env node

// Spawn process and resolve stdout contents
const execCapture = (command) =>
  new Promise((resolve, reject) => {
    let data = '';
    const process = require('child_process').spawn(command, {
      stdio: 'pipe',
      shell: true,
    });

    process.stdout.on('data', (chunk) => {
      data += chunk;
    });
    process.on('exit', () => resolve(data)).on('error', () => reject(data));
  });

// Given a string, returns a string with a slash at the end.
const endWithSlash = (str) => (str.endsWith('/') ? str : `${str}/`);

// Make string URI safe
const makeSafe = (str) =>
  encodeURIComponent(str).replace(/\(/g, '%28').replace(/\)/g, '%29');

// Receives an array of functions that return promises. Waits for results serially.
const runGettersAndReportProgress = async (promiseGetterArray) => {
  await Promise.all(
    promiseGetterArray.map(async (getPromise, idx) => {
      await getPromise();
      process.stdout.write(
        `   ${idx}/${promiseGetterArray.length} completed\r`,
      );
    }),
  );

  console.log(
    `${promiseGetterArray.length}/${promiseGetterArray.length} completed`,
  );
};

// ENV VARS
const USER = process.env.AMQP_USER || 'guest';
const PASS = process.env.AMQP_PASS || 'guest';
const AMQP_MANAGEMENT_URL = endWithSlash(
  process.env.AMQP_MANAGEMENT_URL || 'http://localhost:15672',
);

const getDeleteCommand = ({ vhost, name, isQueue = true }) =>
  `curl -u ${USER}:${PASS} -XDELETE ` +
  `${AMQP_MANAGEMENT_URL}api/${isQueue ? 'queues' : 'exchanges'}/${makeSafe(
    vhost,
  )}/${makeSafe(name)}`;

execCapture(`curl -u ${USER}:${PASS} ${AMQP_MANAGEMENT_URL}api/exchanges`)
  .then((body) => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      console.log(
        `Request did not return valid JSON.\n${body}\n\nIs the RabbitMQ server running?\n`,
      );
      process.exit(1);
    }

    if (!Array.isArray(parsed)) {
      console.log(`Expected response to be array: \n${body}`);
      process.exit(1);
    }

    console.log('Wiping Exchanges');
    return runGettersAndReportProgress(
      parsed.map(({ name, vhost }) => () =>
        execCapture(getDeleteCommand({ name, vhost, isQueue: false })),
      ),
    );
  })
  .then(() =>
    execCapture(`curl -u ${USER}:${PASS} ${AMQP_MANAGEMENT_URL}api/queues`),
  )
  .then((body) => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      console.log(
        `Request did not return valid JSON.\n${body}\n\nIs the RabbitMQ server running?\n`,
      );
      process.exit(1);
    }

    if (!Array.isArray(parsed)) {
      console.log(`Expected response to be array: \n${body}`);
      process.exit(1);
    }

    console.log('Wiping Queues');
    return runGettersAndReportProgress(
      parsed.map(({ name, vhost }) => () =>
        execCapture(getDeleteCommand({ name, vhost, isQueue: true })),
      ),
    );
  })
  .then(() => console.log('Finished without issue.'))
  .catch(console.error);
