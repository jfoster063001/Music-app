function normalizeOptions(intervalOrOptions) {
  if (typeof intervalOrOptions === "number") {
    return {
      interval: intervalOrOptions,
      hiddenInterval: intervalOrOptions,
      pauseWhenHidden: false
    };
  }

  const options = intervalOrOptions || {};

  const interval = typeof options.interval === "function"
    ? options.interval
    : Math.max(250, Number(options.interval || 1500));

  const hiddenInterval = typeof options.hiddenInterval === "function"
    ? options.hiddenInterval
    : Math.max(
        250,
        Number(options.hiddenInterval || options.interval || 1500)
      );

  return {
    interval,
    hiddenInterval,
    pauseWhenHidden: Boolean(options.pauseWhenHidden)
  };
}

export function startPolling(callback, intervalOrOptions = 1500) {
  const options = normalizeOptions(intervalOrOptions);
  let stopped = false;
  let timer = null;

  const getDelay = () => {
    const visibleDelay = typeof options.interval === "function"
      ? Math.max(250, Number(options.interval()))
      : options.interval;

    const hiddenDelay = typeof options.hiddenInterval === "function"
      ? Math.max(250, Number(options.hiddenInterval()))
      : options.hiddenInterval;

    if (document.hidden) {
      return options.pauseWhenHidden ? null : hiddenDelay;
    }
    return visibleDelay;
  };

  const scheduleNext = () => {
    if (stopped) return;
    const delay = getDelay();
    if (delay == null) return;
    timer = setTimeout(run, delay);
  };

  const run = async () => {
    if (stopped) return;

    try {
      await callback();
    } catch (error) {
      console.error("Polling error:", error);
    } finally {
      scheduleNext();
    }
  };

  const onVisibilityChange = () => {
    if (stopped) return;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (!document.hidden) {
      run();
      return;
    }

    if (!options.pauseWhenHidden) {
      scheduleNext();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
