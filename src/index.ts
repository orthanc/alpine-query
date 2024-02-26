import {
  QueryClientConfig,
  QueryObserverResult,
  notifyManager,
} from '@tanstack/query-core';
import {
  QueryClient,
  QueryKey,
  QueryObserver,
  QueryObserverOptions,
} from '@tanstack/query-core';
import type { Alpine } from 'alpinejs';
import w from 'wretch';
import type { Wretch } from 'wretch';

declare global {
  interface Window {
    Alpine: Alpine;
  }
}

const query = <
  TQueryFnData,
  TError,
  TData,
  TQueryData,
  TQueryKey extends QueryKey,
>(
  queryClient: QueryClient,
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
  window.Alpine.magic(
    'queryClient',
    () => (config?: QueryClientConfig) => new QueryClient(config)
  );
  window.Alpine.magic(
    'wretch',
    () => (baseUrl?: string, options?: RequestInit) => w(baseUrl, options)
  );
  window.Alpine.magic('get', (_, { evaluate }) => {
    const wretch = evaluate('wretch') as Wretch;
    return (
      url: string,
      fetchOptions?: RequestInit,
      queryOptions?: Partial<QueryObserverOptions>
    ): QueryObserverOptions => ({
      queryFn: () => {
        const obj = wretch
          .options(fetchOptions ?? {})
          .get(url)
          .json();
        return obj;
      },
      queryKey: [url],
      ...queryOptions,
    });
  });
  window.Alpine.magic('post', (_, { evaluate }) => {
    const wretch = evaluate('wretch') as Wretch;
    return (
      url: string,
      body: any,
      fetchOptions?: RequestInit,
      queryOptions?: Partial<QueryObserverOptions>
    ): QueryObserverOptions => ({
      queryFn: () => {
        let chain = wretch.options(fetchOptions ?? {}).url(url);
        if (body !== undefined) {
          chain = chain.json(body);
        }
        return chain.post().text();
      },
      queryKey: [url],
      ...queryOptions,
    });
  });
  window.Alpine.directive(
    'query',
    (
      el,
      { value: variable = 'query', expression },
      { Alpine, evaluate, evaluateLater, effect, cleanup }
    ) => {
      const queryClient = Alpine.raw(evaluate('queryClient')) as QueryClient;
      if (queryClient == null) {
        throw new Error(
          'No query client is set, you must have x-data="{queryClient: $queryClient()}" as a parent before use of x-query'
        );
      }
      const getQuery = evaluateLater(expression);

      let updateOptions: undefined | ((options: QueryObserverOptions) => void) =
        undefined;
      const updateResult = (result: QueryObserverResult) => {
        // @ts-expect-error alpine data doesn't seem like something I can type
        Alpine.$data(el)[variable] = result;
      };

      effect(() =>
        getQuery((options: QueryObserverOptions) => {
          if (updateOptions == null) {
            let unsubscribe: () => void;
            ({ unsubscribe, updateOptions } = query(
              queryClient,
              options,
              updateResult
            ));
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
