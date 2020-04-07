const Benchmarkify = require('benchmarkify');

const data = require('./data');
const suiteGenerator = require('./suiteGenerator');

const waitFor = ms => new Promise(res => setTimeout(res, ms));

const benchmark = new Benchmarkify('AMQP Client Performance', {
  // minSamples: 500,
}).printHeader();

// The higher this is the less accurate the results and the longer the benchmarks take to run
// I picked 9 because we sometimes have 3 clients and 3 prefetch in these tests.
const msgCount = 9;

const runSuite = promise =>
  promise.then(({ suite, teardown }) => {
    return benchmark
      .run([suite])
      .then(() => waitFor(500))
      .then(() => teardown());
  });

async function main() {
  const prefetchOpt = [1, 3];
  const clientCountOpt = [1, 3];
  const delayOpt = [0, 25];
  const msgOpt = [
    { label: '10 Bytes', payload: data['10'] },
    { label: '50k Bytes', payload: data['50k'] },
  ];

  for (const msg of msgOpt) {
    for (const delay of delayOpt) {
      for (const prefetch of prefetchOpt) {
        for (const clientCount of clientCountOpt) {
          await runSuite(
            suiteGenerator({
              benchmark,
              msg,
              msgCount,
              delay,
              clientCount,
              prefetch,
            }),
          );
        }
      }
    }
  }
}

main();

/* Posting output for future reference and convenience.
====================
  AMQP Client perf
====================

Platform info:
==============
   Darwin 17.7.0 x64
   Node.JS: 8.12.0
   V8: 6.2.414.66
   Intel(R) Core(TM) i7-4870HQ CPU @ 2.50GHz × 8

Suite: 10 Bytes msg, no delay, 1 clients, 1 prefetch
✔ 9 commands*                               173 rps
✔ 9 events, 3 consumer groups*              119 rps

   9 commands*                            0%            (173 rps)   (avg: 5ms)
   9 events, 3 consumer groups*      -31.12%            (119 rps)   (avg: 8ms)
-----------------------------------------------------------------------

Suite: 10 Bytes msg, no delay, 3 clients, 1 prefetch
✔ 9 commands*                               169 rps
✔ 9 events, 3 consumer groups*              113 rps

   9 commands*                            0%            (169 rps)   (avg: 5ms)
   9 events, 3 consumer groups*      -32.76%            (113 rps)   (avg: 8ms)
-----------------------------------------------------------------------

Suite: 10 Bytes msg, no delay, 1 clients, 3 prefetch
✔ 9 commands*                               149 rps
✔ 9 events, 3 consumer groups*              125 rps

   9 commands*                            0%            (149 rps)   (avg: 6ms)
   9 events, 3 consumer groups*      -15.63%            (125 rps)   (avg: 7ms)
-----------------------------------------------------------------------

Suite: 10 Bytes msg, no delay, 3 clients, 3 prefetch
✔ 9 commands*                               178 rps
✔ 9 events, 3 consumer groups*              112 rps

   9 commands*                            0%            (178 rps)   (avg: 5ms)
   9 events, 3 consumer groups*      -36.99%            (112 rps)   (avg: 8ms)
-----------------------------------------------------------------------

Suite: 10 Bytes msg, 25ms delay, 1 clients, 1 prefetch
✔ 9 commands*                                 4 rps
✔ 9 events, 3 consumer groups*                4 rps

   9 commands*                            0%              (4 rps)   (avg: 263ms)
   9 events, 3 consumer groups*        -0.9%              (4 rps)   (avg: 266ms)
-----------------------------------------------------------------------

Suite: 10 Bytes msg, 25ms delay, 3 clients, 1 prefetch
✔ 9 commands*                                11 rps
✔ 9 events, 3 consumer groups*               11 rps

   9 commands*                            0%             (11 rps)   (avg: 89ms)
   9 events, 3 consumer groups*       -1.06%             (11 rps)   (avg: 90ms)
-----------------------------------------------------------------------

Suite: 10 Bytes msg, 25ms delay, 1 clients, 3 prefetch
✔ 9 commands*                                11 rps
✔ 9 events, 3 consumer groups*               11 rps

   9 commands*                            0%             (11 rps)   (avg: 88ms)
   9 events, 3 consumer groups*       -1.05%             (11 rps)   (avg: 89ms)
-----------------------------------------------------------------------

Suite: 10 Bytes msg, 25ms delay, 3 clients, 3 prefetch
✔ 9 commands*                                29 rps
✔ 9 events, 3 consumer groups*               26 rps

   9 commands*                            0%             (29 rps)   (avg: 34ms)
   9 events, 3 consumer groups*       -9.85%             (26 rps)   (avg: 38ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, no delay, 1 clients, 1 prefetch
✔ 9 commands*                                99 rps
✔ 9 events, 3 consumer groups*               63 rps

   9 commands*                            0%             (99 rps)   (avg: 10ms)
   9 events, 3 consumer groups*      -37.11%             (63 rps)   (avg: 15ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, no delay, 3 clients, 1 prefetch
✔ 9 commands*                                98 rps
✔ 9 events, 3 consumer groups*               60 rps

   9 commands*                            0%             (98 rps)   (avg: 10ms)
   9 events, 3 consumer groups*      -38.98%             (60 rps)   (avg: 16ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, no delay, 1 clients, 3 prefetch
✔ 9 commands*                                97 rps
✔ 9 events, 3 consumer groups*               61 rps

   9 commands*                            0%             (97 rps)   (avg: 10ms)
   9 events, 3 consumer groups*      -36.85%             (61 rps)   (avg: 16ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, no delay, 3 clients, 3 prefetch
✔ 9 commands*                                97 rps
✔ 9 events, 3 consumer groups*               63 rps

   9 commands*                            0%             (97 rps)   (avg: 10ms)
   9 events, 3 consumer groups*      -35.78%             (63 rps)   (avg: 15ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, 25ms delay, 1 clients, 1 prefetch
✔ 9 commands*                                 4 rps
✔ 9 events, 3 consumer groups*                4 rps

   9 commands*                            0%              (4 rps)   (avg: 267ms)
   9 events, 3 consumer groups*       -1.02%              (4 rps)   (avg: 270ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, 25ms delay, 3 clients, 1 prefetch
✔ 9 commands*                                11 rps
✔ 9 events, 3 consumer groups*               11 rps

   9 commands*                            0%             (11 rps)   (avg: 91ms)
   9 events, 3 consumer groups*        -2.4%             (11 rps)   (avg: 93ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, 25ms delay, 1 clients, 3 prefetch
✔ 9 commands*                                11 rps
✔ 9 events, 3 consumer groups*               11 rps

   9 commands*                            0%             (11 rps)   (avg: 91ms)
   9 events, 3 consumer groups*       -1.26%             (11 rps)   (avg: 92ms)
-----------------------------------------------------------------------

Suite: 50k Bytes msg, 25ms delay, 3 clients, 3 prefetch
✔ 9 commands*                                26 rps
✔ 9 events, 3 consumer groups*               23 rps

   9 commands*                            0%             (26 rps)   (avg: 37ms)
   9 events, 3 consumer groups*      -12.91%             (23 rps)   (avg: 43ms)
-----------------------------------------------------------------------


real	35m29.420s
user	2m12.884s
sys	0m44.587s
*/
