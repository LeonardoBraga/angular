/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Inject, Injectable, InjectionToken, Optional, ɵConsole as Console} from '@angular/core';

import {DOCUMENT} from '../dom_tokens';

import {EventManagerPlugin} from './event_manager';

const EVENT_NAMES = {
  // pan
  'pan': true,
  'panstart': true,
  'panmove': true,
  'panend': true,
  'pancancel': true,
  'panleft': true,
  'panright': true,
  'panup': true,
  'pandown': true,
  // pinch
  'pinch': true,
  'pinchstart': true,
  'pinchmove': true,
  'pinchend': true,
  'pinchcancel': true,
  'pinchin': true,
  'pinchout': true,
  // press
  'press': true,
  'pressup': true,
  // rotate
  'rotate': true,
  'rotatestart': true,
  'rotatemove': true,
  'rotateend': true,
  'rotatecancel': true,
  // swipe
  'swipe': true,
  'swipeleft': true,
  'swiperight': true,
  'swipeup': true,
  'swipedown': true,
  // tap
  'tap': true,
};

/**
 * A DI token that you can use to provide{@link HammerGestureConfig} to Angular. Use it to configure
 * Hammer gestures.
 *
 * @experimental
 */
export const HAMMER_GESTURE_CONFIG = new InjectionToken<HammerGestureConfig>('HammerGestureConfig');


/** Function that loads HammerJS, returning a promise that is resolved once HammerJs is loaded. */
export type HammerLoader = (() => Promise<void>) | null;

/** Injection token used to provide a {@link HammerLoader} to Angular. */
export const HAMMER_LOADER = new InjectionToken<HammerLoader>('HammerLoader');

export interface HammerInstance {
  on(eventName: string, callback?: Function): void;
  off(eventName: string, callback?: Function): void;
}

/**
 * @experimental
 */
@Injectable()
export class HammerGestureConfig {
  events: string[] = [];

  overrides: {[key: string]: Object} = {};

  options?: {
    cssProps?: any; domEvents?: boolean; enable?: boolean | ((manager: any) => boolean);
    preset?: any[];
    touchAction?: string;
    recognizers?: any[];
    inputClass?: any;
    inputTarget?: EventTarget;
  };

  buildHammer(element: HTMLElement): HammerInstance {
    const mc = new Hammer(element, this.options);

    mc.get('pinch').set({enable: true});
    mc.get('rotate').set({enable: true});

    for (const eventName in this.overrides) {
      mc.get(eventName).set(this.overrides[eventName]);
    }

    return mc;
  }
}

@Injectable()
export class HammerGesturesPlugin extends EventManagerPlugin {
  constructor(
      @Inject(DOCUMENT) doc: any,
      @Inject(HAMMER_GESTURE_CONFIG) private _config: HammerGestureConfig, private console: Console,
      @Optional() @Inject(HAMMER_LOADER) private loader?: HammerLoader) {
    super(doc);
  }

  supports(eventName: string): boolean {
    if (!EVENT_NAMES.hasOwnProperty(eventName.toLowerCase()) && !this.isCustomEvent(eventName)) {
      return false;
    }

    if (!(window as any).Hammer && !this.loader) {
      this.console.warn(
          `The "${eventName}" event cannot be bound because Hammer.JS is not ` +
          `loaded and no custom loader has been specified.`);
      return false;
    }

    return true;
  }

  addEventListener(element: HTMLElement, eventName: string, handler: Function): Function {
    const zone = this.manager.getZone();
    eventName = eventName.toLowerCase();

    // If Hammer is not present but a loader is specified, we defer adding the event listener
    // until Hammer is loaded.
    if (!(window as any).Hammer && this.loader) {
      // This `addEventListener` method returns a function to remove the added listener.
      // Until Hammer is loaded, the returned function needs to *cancel* the registration rather
      // than remove anything.
      let cancelRegistration = false;
      let deregister: Function = () => { cancelRegistration = true; };

      this.loader()
          .then(() => {
            // If Hammer isn't actually loaded when the custom loader resolves, give up.
            if (!(window as any).Hammer) {
              this.console.warn(
                  `The custom HAMMER_LOADER completed, but Hammer.JS is not present.`);
              deregister = () => {};
              return;
            }

            if (!cancelRegistration) {
              // Now that Hammer is loaded and the listener is being loaded for real,
              // the deregistration function changes from canceling registration to removal.
              deregister = this.addEventListener(element, eventName, handler);
            }
          })
          .catch(() => {
            this.console.warn(
                `The "${eventName}" event cannot be bound because the custom ` +
                `Hammer.JS loader failed.`);
            deregister = () => {};
          });

      // Return a function that *executes* `deregister` (and not `deregister` itself) so that we
      // can change the behavior of `deregister` once the listener is added. Using a closure in
      // this way allows us to avoid any additional data structures to track listener removal.
      return () => { deregister(); };
    }

    return zone.runOutsideAngular(() => {
      // Creating the manager bind events, must be done outside of angular
      const mc = this._config.buildHammer(element);
      const callback = function(eventObj: HammerInput) {
        zone.runGuarded(function() { handler(eventObj); });
      };
      mc.on(eventName, callback);
      return () => mc.off(eventName, callback);
    });
  }

  isCustomEvent(eventName: string): boolean { return this._config.events.indexOf(eventName) > -1; }
}
