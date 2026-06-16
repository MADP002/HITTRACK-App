// Polyfills for React Native / Hermes
// Some packages built for browser environments reference these APIs on startup

if (typeof global.DOMException === 'undefined') {
  global.DOMException = class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'DOMException';
      this.code = 0;
    }
  };
}

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      const buf = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
      return buf;
    }
  };
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = class TextDecoder {
    decode(buf) { return String.fromCharCode(...buf); }
  };
}

if (typeof global.URL === 'undefined') {
  global.URL = class URL {
    constructor(url) { this.href = url; }
    toString() { return this.href; }
  };
}