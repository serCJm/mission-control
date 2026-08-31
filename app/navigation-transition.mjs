/**
 * @typedef {object} NavigationTransitionRequest
 * @property {boolean} unchanged
 * @property {boolean} reducedMotion
 * @property {((update: () => void) => unknown) | undefined} startTransition
 * @property {() => void} update
 */

export function createNavigationTransition() {
  let latestRequest = 0;

  /** @param {NavigationTransitionRequest} request */
  return function navigate({ unchanged, reducedMotion, startTransition, update }) {
    const request = ++latestRequest;
    const commit = () => {
      if (request === latestRequest) update();
    };

    if (unchanged || reducedMotion || !startTransition) {
      commit();
      return;
    }

    startTransition(commit);
  };
}
