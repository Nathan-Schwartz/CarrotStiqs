const handlerTestEnhancer = (rej, fn) => async data => {
  try {
    await fn(data);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('handler throw:', e);
    rej(e);
    throw e;
  }
};

module.exports = {
  handlerTestEnhancer,
};
