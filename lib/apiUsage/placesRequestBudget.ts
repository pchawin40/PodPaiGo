import {
  inferGooglePlacesRequestRoute,
  logGooglePlacesConfig,
  logGooglePlacesRequestSummary,
} from '../parking/googlePlacesConfig';
import {
  getMaxGooglePhotoMediaPerRequest,
  getMaxGooglePlaceDetailsPerRequest,
  getMaxGooglePlaceReviewsPerRequest,
  getMaxGooglePlacesCallsPerRequest,
  getMaxGoogleSearchTextPerRequest,
} from './placesRequestLimits';

export type GooglePlacesEndpoint = 'searchText' | 'getPlace' | 'photoMedia' | 'reviews';

export {
  getMaxGooglePhotoMediaPerRequest,
  getMaxGooglePlaceDetailsPerRequest,
  getMaxGooglePlaceReviewsPerRequest,
  getMaxGooglePlacesCallsPerRequest,
  getMaxGoogleSearchTextPerRequest,
} from './placesRequestLimits';

type ActivePlacesRequestBudget = {
  key: string;
  route: string;
  searchText: number;
  getPlace: number;
  photoMedia: number;
  reviews: number;
  total: number;
  blocked: number;
};

let activePlacesRequestBudget: ActivePlacesRequestBudget | null = null;

export function runWithPlacesRequestBudget<T>(
  requestKey: string,
  fn: () => T | Promise<T>,
  options?: { route?: string },
): Promise<T> {
  const route = options?.route ?? inferGooglePlacesRequestRoute(requestKey);

  activePlacesRequestBudget = {
    key: requestKey,
    route,
    searchText: 0,
    getPlace: 0,
    photoMedia: 0,
    reviews: 0,
    total: 0,
    blocked: 0,
  };

  logGooglePlacesConfig('request', { route, requestKey });

  return Promise.resolve(fn()).finally(() => {
    const budget = activePlacesRequestBudget;
    if (budget) {
      logGooglePlacesRequestSummary({
        route: budget.route,
        requestKey: budget.key,
        searchTextUsed: budget.searchText,
        getPlaceUsed: budget.getPlace,
        photoMediaUsed: budget.photoMedia,
        reviewsUsed: budget.reviews,
        totalUsed: budget.total,
        blocked: budget.blocked,
      });
    }

    activePlacesRequestBudget = null;
  });
}

export function getActivePlacesRequestBudget(): ActivePlacesRequestBudget | null {
  return activePlacesRequestBudget;
}

export function recordPlacesRequestBlocked(): void {
  if (!activePlacesRequestBudget) return;
  activePlacesRequestBudget.blocked += 1;
}

export function tryConsumePlacesRequestCall(endpoint: GooglePlacesEndpoint): boolean {
  const totalLimit = getMaxGooglePlacesCallsPerRequest();
  const endpointLimit =
    endpoint === 'searchText'
      ? getMaxGoogleSearchTextPerRequest()
      : endpoint === 'getPlace'
        ? getMaxGooglePlaceDetailsPerRequest()
        : getMaxGooglePhotoMediaPerRequest();

  if (!activePlacesRequestBudget) {
    if (totalLimit === 0 || endpointLimit === 0) {
      return false;
    }
    return true;
  }

  const budget = activePlacesRequestBudget;

  if (budget.total >= totalLimit) {
    budget.blocked += 1;
    return false;
  }

  if (endpoint === 'searchText' && budget.searchText >= endpointLimit) {
    budget.blocked += 1;
    return false;
  }

  if (endpoint === 'getPlace' && budget.getPlace >= endpointLimit) {
    budget.blocked += 1;
    return false;
  }

  if (endpoint === 'photoMedia' && budget.photoMedia >= endpointLimit) {
    budget.blocked += 1;
    return false;
  }

  budget.total += 1;
  if (endpoint === 'searchText') budget.searchText += 1;
  if (endpoint === 'getPlace') budget.getPlace += 1;
  if (endpoint === 'photoMedia') budget.photoMedia += 1;

  return true;
}

export function tryConsumePlacesReviewCall(): boolean {
  const reviewsLimit = getMaxGooglePlaceReviewsPerRequest();
  const detailsLimit = getMaxGooglePlaceDetailsPerRequest();
  const totalLimit = getMaxGooglePlacesCallsPerRequest();

  if (!activePlacesRequestBudget) {
    if (reviewsLimit === 0 || detailsLimit === 0 || totalLimit === 0) {
      return false;
    }
    return true;
  }

  const budget = activePlacesRequestBudget;

  if (
    budget.reviews >= reviewsLimit ||
    budget.getPlace >= detailsLimit ||
    budget.total >= totalLimit
  ) {
    budget.blocked += 1;
    return false;
  }

  budget.reviews += 1;
  budget.getPlace += 1;
  budget.total += 1;
  return true;
}

export function resetPlacesRequestBudgetForTests(): void {
  activePlacesRequestBudget = null;
}
