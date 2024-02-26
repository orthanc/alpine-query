import { QueryObserverResult, notifyManager } from '@tanstack/query-core';
import {
  QueryClient,
  QueryKey,
  QueryObserver,
  QueryObserverOptions,
} from '@tanstack/query-core';
import type { Alpine } from 'alpinejs';
import w from 'wretch';

declare global {
  interface Window {
    Alpine: Alpine;
  }
}

const queryClient = new QueryClient();
const wretch = w();

const query = <
  TQueryFnData,
  TError,
  TData,
  TQueryData,
  TQueryKey extends QueryKey,
>(
  options: QueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >,
  resultChanged: (result: QueryObserverResult<TData, TError>) => void
) => {
  const defaultedOptions = queryClient.defaultQueryOptions(options);
  defaultedOptions._optimisticResults = 'optimistic';

  const observer = new QueryObserver<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >(queryClient, defaultedOptions);
  const unsubscribe = observer.subscribe(
    notifyManager.batchCalls((result) =>
      resultChanged(observer.trackResult(result))
    )
  );
  // Update result to make sure we did not miss any query updates
  // between creating the observer and subscribing to it.
  observer.updateResult();

  const result = observer.getOptimisticResult(defaultedOptions);

  const updateOptions = (
    options: QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >
  ) => {
    const defaultedOptions = queryClient.defaultQueryOptions(options);
    defaultedOptions._optimisticResults = 'optimistic';
    observer.setOptions(defaultedOptions, { listeners: false });
  };

  resultChanged(observer.trackResult(result));
  return { updateOptions, unsubscribe };
};

document.addEventListener('alpine:init', () => {
  window.Alpine.directive(
    'query',
    (
      el,
      { value: variable = 'query', expression },
      { Alpine, evaluateLater, effect, cleanup }
    ) => {
      const getQuery = evaluateLater(expression);

      let updateOptions: undefined | ((options: QueryObserverOptions) => void) =
        undefined;
      const updateResult = (result: QueryObserverResult) => {
        // @ts-expect-error
        Alpine.$data(el)[variable] = result;
      };

      effect(() =>
        getQuery((url: string) => {
          const options: QueryObserverOptions = {
            queryFn: () => wretch.get(url).json(),
            queryKey: [url],
          };
          if (updateOptions == null) {
            let unsubscribe: () => void;
            ({ unsubscribe, updateOptions } = query(options, updateResult));
            cleanup(unsubscribe);
          } else {
            updateOptions(options);
          }
        })
      );
    }
  );
});

export {};
