export function debounce(fn, delayMs) {
  let timer = null;

  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  }

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };

  debounced.flush = (...args) => {
    debounced.cancel();
    fn(...args);
  };

  return debounced;
}
