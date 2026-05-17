declare module "@novnc/novnc" {
  export interface RfbOptions {
    credentials?: Record<string, string>;
  }

  export default class RFB {
    constructor(target: Element, url: string | unknown, options?: RfbOptions);
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
    disconnect(): void;
    addEventListener(type: string, listener: (event: Event) => void): void;
  }
}
