declare global {
  interface Window {
    fbq: any;
  }
  // eslint-disable-next-line no-var
  var fbq: ((...args: any[]) => void) | undefined;
}

export {};
