# React rules (stack-web)

- Components are pure functions of props and state. No side effects during render; effects only to synchronize with something outside React.
- Derive values during render instead of copying props into state. Do not write an effect that only sets state from other state.
- Lists have stable, unique `key`s from the data, never the array index for lists that can change.
- Lift state only as far as it is shared. Server data goes through the framework's data layer or a query library (cache, retries, invalidation), not ad-hoc `useEffect` + `fetch`.
- Every async view has explicit loading, error and empty states. Use error boundaries around independent sections.
- Forms: controlled or `FormData`-based, validated with the same schema the server uses, with server errors shown next to the field.
- Memoization (`useMemo`, `useCallback`, `memo`) only for a measured problem or a referential-identity requirement.
- Components and hooks are tested through what the user sees (Testing Library queries by role and label), not through implementation details.
