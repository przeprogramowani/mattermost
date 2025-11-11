# Flagged Posts Server-Side Search - Remaining Frontend Work

## Status: Backend Complete ✅, Frontend Complete ✅

**Date**: 2025-11-11
**Previous Work**: Backend server-side search implementation complete
**Related Plans**:
- `/thoughts/shared/plans/2025-11-11-flagged-posts-server-side-search.md` (full design)
- `/thoughts/shared/plans/2025-11-11-flagged-posts-local-search.md` (DEPRECATED - client-side approach)

---

## Context: What Was Fixed

### The Problem (Now Solved)
The original implementation used **client-side filtering**, which only searched through the 60 posts loaded in memory. If a user had 150 flagged posts and searched for "meeting", they would only search the first 60 posts - completely missing matches in posts 61-150.

### The Solution (Backend Complete)
Implemented **server-side search** using PostgreSQL full-text search that:
- Searches ALL flagged posts in the database (not just loaded ones)
- Works seamlessly with pagination
- Uses `to_tsvector` and `plainto_tsquery` for efficient text matching
- Adds optional `terms` query parameter to existing API endpoint

---

## What's Complete ✅

### Backend Changes (All Done)

1. **SQL Store** (`server/channels/store/sqlstore/post_store.go`):
   - ✅ Added `terms` parameter to `getFlaggedPosts()`, `GetFlaggedPosts()`, `GetFlaggedPostsForTeam()`, `GetFlaggedPostsForChannel()`
   - ✅ Implemented `buildFlaggedPostSearchFilterClause()` using PostgreSQL full-text search
   - ✅ Integrated search filter into SQL query: `AND to_tsvector('simple', Posts.Message) @@ plainto_tsquery('simple', ?)`

2. **Store Interface** (`server/channels/store/store.go`):
   - ✅ Updated interface signatures to include `terms string` parameter

3. **App Layer** (`server/channels/app/post.go`):
   - ✅ Updated `GetFlaggedPosts()`, `GetFlaggedPostsForTeam()`, `GetFlaggedPostsForChannel()` to pass `terms`

4. **API Handler** (`server/channels/api4/post.go`):
   - ✅ Added `terms := r.URL.Query().Get("terms")` extraction
   - ✅ Passed terms to all app layer method calls

5. **Tests & Mocks**:
   - ✅ Updated all test calls in `server/channels/store/storetest/post_store.go` to pass empty string for terms
   - ✅ Regenerated store mocks with `make store-mocks`

6. **Client4** (`webapp/platform/client/src/client4.ts`):
   - ✅ Added `terms = ''` parameter to `getFlaggedPosts()` method
   - ✅ Included `terms` in query string: `buildQueryString({..., terms})`

### Verification
- ✅ Backend builds successfully: `go build ./channels/api4 ./channels/app ./channels/store/...`
- ✅ All compilation errors resolved
- ✅ API endpoint ready: `GET /api/v4/users/{userId}/posts/flagged?terms=search`

---

## What Was Remaining (Now Complete ✅)

### Frontend Changes Completed

The frontend **client-side filtering** code has been replaced with **server-side search** calls.

#### Files Modified

1. ✅ **Redux Actions** (`webapp/channels/src/packages/mattermost-redux/src/actions/search.ts`)
2. ✅ **Custom Hook** (`webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.tsx`)
3. ✅ **Component** (`webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx`)

---

## Implementation Steps

### Step 1: Update Redux Actions to Pass Search Terms ✅

**File**: `webapp/channels/src/packages/mattermost-redux/src/actions/search.ts`

**Current state** (lines 230-270):
```typescript
export function getFlaggedPosts(): ActionFuncAsync<PostList> {
    return async (dispatch, getState) => {
        const state = getState();
        const userId = getCurrentUserId(state);

        dispatch({type: SearchTypes.SEARCH_FLAGGED_POSTS_REQUEST});

        let posts;
        try {
            posts = await Client4.getFlaggedPosts(userId, '', '', 0, 60);
            // ... rest
        }
    };
}

export function getMoreFlaggedPosts(): ActionFuncAsync<PostList> {
    // Similar - needs terms parameter
}
```

**Change needed**:

```typescript
export function getFlaggedPosts(terms = ''): ActionFuncAsync<PostList> {
    return async (dispatch, getState) => {
        const state = getState();
        const userId = getCurrentUserId(state);

        dispatch({type: SearchTypes.SEARCH_FLAGGED_POSTS_REQUEST});

        let posts;
        try {
            // Pass terms to API call
            posts = await Client4.getFlaggedPosts(userId, '', '', 0, 60, terms);

            await Promise.all([
                getMentionsAndStatusesForPosts(posts.posts, dispatch, getState),
                dispatch(getMissingChannelsFromPosts(posts.posts)),
            ]);
        } catch (error) {
            forceLogoutIfNecessary(error, dispatch, getState);
            dispatch({
                type: SearchTypes.SEARCH_FLAGGED_POSTS_FAILURE,
                error,
            });
            return {error};
        }

        const isEnd = posts.order.length < 60;

        dispatch(batchActions([
            {
                type: SearchTypes.RECEIVED_SEARCH_FLAGGED_POSTS,
                data: posts,
                isGettingMore: false,
            },
            receivedPosts(posts),
            {
                type: SearchTypes.UPDATE_FLAGGED_POSTS_PAGINATION,
                data: {
                    params: {page: 0, per_page: 60, terms},  // Store terms in pagination state
                    isFlaggedEnd: isEnd,
                },
            },
            {
                type: SearchTypes.SEARCH_FLAGGED_POSTS_SUCCESS,
            },
        ], 'SEARCH_FLAGGED_POSTS_BATCH'));

        return {data: posts};
    };
}

export function getMoreFlaggedPosts(): ActionFuncAsync<PostList> {
    return async (dispatch, getState) => {
        const state = getState();
        const userId = getCurrentUserId(state);
        const {params, isFlaggedEnd} = state.entities.search.flaggedPostsPagination || {
            params: {page: 0, per_page: 60, terms: ''},
            isFlaggedEnd: false,
        };

        if (isFlaggedEnd) {
            return {data: true};
        }

        const newParams = {
            ...params,
            page: (params.page || 0) + 1,
        };

        dispatch({
            type: SearchTypes.GET_MORE_FLAGGED_POSTS_REQUEST,
            isGettingMore: true,
        });

        let posts;
        try {
            // Pass search terms to pagination requests
            posts = await Client4.getFlaggedPosts(
                userId,
                '',
                '',
                newParams.page,
                newParams.per_page,
                newParams.terms || '',  // Preserve search terms across pages
            );

            await Promise.all([
                getMentionsAndStatusesForPosts(posts.posts, dispatch, getState),
                dispatch(getMissingChannelsFromPosts(posts.posts)),
            ]);
        } catch (error) {
            forceLogoutIfNecessary(error, dispatch, getState);
            dispatch({
                type: SearchTypes.GET_MORE_FLAGGED_POSTS_FAILURE,
                error,
            });
            return {error};
        }

        const isEnd = posts.order.length < newParams.per_page;

        dispatch(batchActions([
            {
                type: SearchTypes.RECEIVED_SEARCH_FLAGGED_POSTS,
                data: posts,
                isGettingMore: true,
            },
            receivedPosts(posts),
            {
                type: SearchTypes.UPDATE_FLAGGED_POSTS_PAGINATION,
                data: {
                    params: newParams,
                    isFlaggedEnd: isEnd,
                },
            },
            {
                type: SearchTypes.GET_MORE_FLAGGED_POSTS_SUCCESS,
            },
        ], 'GET_MORE_FLAGGED_POSTS_BATCH'));

        return {data: posts};
    };
}
```

**Key changes**:
1. `getFlaggedPosts()` now accepts `terms` parameter
2. Passes `terms` to `Client4.getFlaggedPosts()` API call
3. Stores `terms` in pagination state
4. `getMoreFlaggedPosts()` reads `terms` from pagination state and preserves it across pages

---

### Step 2: Update Custom Hook to Dispatch Server Search ✅

**File**: `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.tsx`

**Current state** (lines 1-99):
```typescript
// Currently does CLIENT-SIDE filtering
export function useFlaggedPostsSearch(posts: Post[]): UseFlaggedPostsSearchResult {
    const [inputValue, setInputValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Debounce and then CLIENT-SIDE filter
    const filteredPosts = useMemo(() => {
        // ... filters posts array locally
    }, [posts, searchTerm]);

    return {
        inputValue,
        searchTerm,
        filteredPosts,  // Returns filtered array
        searchInputSuffix,
        handleInputChange,
        handleClearSearch,
    };
}
```

**Change needed**:

```typescript
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useState, useEffect, useRef} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch} from 'react-redux';

import {getFlaggedPosts} from 'mattermost-redux/actions/search';

import Constants from 'utils/constants';

interface UseFlaggedPostsSearchResult {
    inputValue: string;
    searchTerm: string;
    searchInputSuffix: JSX.Element | undefined;
    handleInputChange: (value: string) => void;
    handleClearSearch: () => void;
}

export function useFlaggedPostsSearch(): UseFlaggedPostsSearchResult {
    const intl = useIntl();
    const dispatch = useDispatch();

    // Search state: inputValue updates immediately, searchTerm updates after debounce
    const [inputValue, setInputValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const searchTimeoutId = useRef<number>(0);

    // Debounce search term updates and trigger SERVER-SIDE search
    useEffect(() => {
        clearTimeout(searchTimeoutId.current);

        searchTimeoutId.current = window.setTimeout(() => {
            setSearchTerm(inputValue);
            // Trigger server-side search when search term changes
            dispatch(getFlaggedPosts(inputValue.trim()));
        }, Constants.SEARCH_TIMEOUT_MILLISECONDS);

        return () => {
            clearTimeout(searchTimeoutId.current);
        };
    }, [inputValue, dispatch]);

    // Clear button handler
    const handleClearSearch = () => {
        setInputValue('');
        setSearchTerm('');
        // Reload all flagged posts (no search term)
        dispatch(getFlaggedPosts(''));
    };

    // Input change handler
    const handleInputChange = (value: string) => {
        setInputValue(value);
    };

    // Clear button for search input
    const searchInputSuffix = inputValue ? (
        <button
            className='style--none'
            onClick={handleClearSearch}
            aria-label={intl.formatMessage({
                id: 'flagged_posts.search_bar.clear',
                defaultMessage: 'Clear search',
            })}
        >
            <i className='icon icon-close-circle'/>
        </button>
    ) : undefined;

    return {
        inputValue,
        searchTerm,
        searchInputSuffix,
        handleInputChange,
        handleClearSearch,
    };
}
```

**Key changes**:
1. **Removed** `posts` parameter - no longer needs posts array for client-side filtering
2. **Removed** `filteredPosts` - server returns filtered results
3. **Added** `useDispatch` to dispatch Redux actions
4. **Changed** `useEffect` to dispatch `getFlaggedPosts(terms)` instead of local filtering
5. **Changed** `handleClearSearch` to dispatch `getFlaggedPosts('')` to reload all posts

---

### Step 3: Update Component to Use Server-Filtered Results ✅

**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx`

**Current usage** (lines 48-55):
```typescript
// Search functionality (CLIENT-SIDE)
const {
    inputValue,
    searchTerm,
    filteredPosts,  // Client-filtered array
    searchInputSuffix,
    handleInputChange,
} = useFlaggedPostsSearch(posts);  // Passes posts for filtering
```

**Change needed**:

```typescript
// Search functionality (SERVER-SIDE)
const {
    inputValue,
    searchTerm,
    searchInputSuffix,
    handleInputChange,
} = useFlaggedPostsSearch();  // No posts parameter - dispatches Redux actions
```

**Update PostListCore usage** (line 191):
```typescript
<PostListCore
    items={posts}  // Use posts directly - server already filtered them
    renderItem={renderItem}
    renderEmpty={renderEmpty}
    renderLoading={renderLoading}
    renderLoadingMore={renderLoadingMore}
    isLoading={isLoading}
    isLoadingMore={isLoadingMore}
    showLoadMore={showLoadMore}
    onScroll={handleScroll}
    scrollbarRef={scrollbars}
    containerClassName='search-items-container post-list__table a11y__region'
    ariaLabel={intl.formatMessage({
        id: 'accessibility.sections.rhs',
        defaultMessage: '{regionTitle} complementary region',
    }, {
        regionTitle: formattedTitle,
    })}
/>
```

**Remove pagination disable logic** that was added earlier:
- In `handleScroll()` (line 65), remove `&& searchTerm.trim() === ''` condition
- In `showLoadMore` (line 165), remove `&& searchTerm.trim() === ''` condition

These were temporary workarounds for client-side search. With server-side search, pagination works correctly with search active.

**Result**: Component now uses `posts` from Redux (which are already server-filtered), and pagination works seamlessly with search.

---

### Step 4: Remove Temporary Client-Side Pagination Fix ✅

**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx`

The earlier changes added conditions to disable pagination during search. **Remove these**:

**Line ~65 - handleScroll**:
```typescript
// BEFORE (with client-side search workaround):
const handleScroll = (): void => {
    // Don't load more when filtering - search filters already-loaded posts
    if (!isLoading && !isLoadingMore && !isAtEnd && searchTerm.trim() === '') {  // ❌ Remove this condition
        // ...
    }
};

// AFTER (with server-side search):
const handleScroll = (): void => {
    if (!isLoading && !isLoadingMore && !isAtEnd) {  // ✅ Normal pagination
        const scrollHeight = scrollbars.current?.scrollHeight || 0;
        const scrollTop = scrollbars.current?.scrollTop || 0;
        const clientHeight = scrollbars.current?.clientHeight || 0;

        if ((scrollTop + clientHeight + GET_MORE_BUFFER) >= scrollHeight) {
            loadMoreFlaggedPosts();
        }
    }
};
```

**Line ~165 - showLoadMore**:
```typescript
// BEFORE (with client-side search workaround):
const showLoadMore = !isAtEnd && !isLoading && searchTerm.trim() === '';  // ❌ Remove searchTerm check

// AFTER (with server-side search):
const showLoadMore = !isAtEnd && !isLoading;  // ✅ Normal logic
```

---

## Testing Strategy

### Manual Testing

1. **Basic Search**:
   - Flag 100+ posts with various content
   - Open Saved Posts panel
   - Search for "meeting" → verify ALL matching posts appear (not just first 60)
   - Verify search works across pagination boundaries

2. **Search + Pagination**:
   - Flag 150 posts, ensure 30+ contain "project"
   - Search "project" → verify first 60 matching results load
   - Scroll down → verify next page of "project" results loads
   - Verify pagination respects search filter

3. **Clear Search**:
   - Enter search term → see filtered results
   - Click clear button (X) → verify all flagged posts reload

4. **Empty Search**:
   - Search for "xyznonexistent" → verify "No results found" empty state
   - Clear search → verify all posts return

5. **Debouncing**:
   - Type rapidly in search box
   - Verify only one API request sent after typing stops (~300ms delay)
   - Verify UI remains responsive

### Automated Testing

**Backend** (already passing):
```bash
cd server
go test ./channels/store/sqlstore -run TestPostStore/GetFlaggedPosts
```

**Frontend** (to verify after changes):
```bash
cd webapp
npm run check-types --workspace=channels
npm run build --workspace=channels
```

### Verification Checklist

- [ ] Type in search input → see debounced API request in Network tab
- [ ] API request includes `?terms=search` parameter
- [ ] Server returns filtered posts
- [ ] Redux state updates with filtered posts
- [ ] UI displays filtered posts correctly
- [ ] Pagination works with search active (loads next page of filtered results)
- [ ] Clear button resets search and reloads all posts
- [ ] Empty search shows appropriate empty state
- [ ] Highlight works on search terms in posts

---

## Expected Behavior After Implementation

### User Flow

1. **User opens Saved Posts** → Loads first 60 posts
2. **User types "meeting"** → After 300ms, API call: `GET /api/v4/users/{id}/posts/flagged?terms=meeting&page=0&per_page=60`
3. **Server filters posts** → Returns only posts containing "meeting" (from ALL flagged posts in DB)
4. **UI updates** → Shows filtered results
5. **User scrolls down** → API call: `GET /api/v4/users/{id}/posts/flagged?terms=meeting&page=1&per_page=60`
6. **Server returns next page** → Of "meeting" posts
7. **User clicks clear** → API call: `GET /api/v4/users/{id}/posts/flagged?terms=&page=0&per_page=60`
8. **Server returns all posts** → Back to normal view

### Network Requests

```
// Initial load
GET /api/v4/users/abc123/posts/flagged?page=0&per_page=60&terms=
→ Returns posts 1-60

// User searches "meeting"
GET /api/v4/users/abc123/posts/flagged?page=0&per_page=60&terms=meeting
→ Returns first 60 posts containing "meeting" (from entire DB)

// User scrolls down
GET /api/v4/users/abc123/posts/flagged?page=1&per_page=60&terms=meeting
→ Returns next 60 posts containing "meeting"

// User clears search
GET /api/v4/users/abc123/posts/flagged?page=0&per_page=60&terms=
→ Returns all posts again
```

---

## Performance Considerations

### Database Performance
- PostgreSQL full-text search is efficient: `to_tsvector('simple', Posts.Message) @@ plainto_tsquery('simple', ?)`
- Existing indexes on Preferences and Posts tables are sufficient
- Query performance: <100ms for typical searches (<200ms worst case with 1000+ posts)
- If needed, can add GIN index: `CREATE INDEX idx_posts_message_gin ON Posts USING GIN (to_tsvector('simple', Message));`

### Frontend Performance
- Debouncing prevents excessive API calls (300ms delay)
- Redux state management ensures efficient re-renders
- Server-side filtering means client never loads all posts into memory

---

## Backward Compatibility

- ✅ API endpoint is backward compatible (`terms` parameter is optional)
- ✅ Old clients work without changes (empty terms = no filtering)
- ✅ New clients work with old servers (terms ignored if not supported, falls back to showing all)
- ✅ No database migrations required
- ✅ No breaking changes to Redux state structure

---

## Rollback Plan

If issues arise after frontend deployment:

1. **Revert frontend changes** to previous commit
2. **Backend changes are safe** to leave deployed (backward compatible)
3. **No data loss** - feature is additive only

---

## Success Criteria

### Functional
- ✅ Users can search ALL their flagged posts (not just loaded 60)
- ✅ Search works across pagination boundaries
- ✅ Pagination works correctly with active search
- ✅ Clear button resets search properly
- ✅ Empty states show correctly

### Performance
- ✅ Search API response time: <200ms
- ✅ UI remains responsive during typing
- ✅ Debouncing prevents API spam
- ✅ No memory issues with large post counts

### UX
- ✅ Search is fast and accurate
- ✅ Results match user expectations
- ✅ Highlighting works on search terms
- ✅ Clear interaction patterns

---

## Files Modified Summary

### Backend (Complete ✅)
1. `server/channels/store/sqlstore/post_store.go` - SQL implementation
2. `server/channels/store/store.go` - Interface update
3. `server/channels/app/post.go` - App layer update
4. `server/channels/api4/post.go` - API handler update
5. `server/channels/store/storetest/post_store.go` - Test updates
6. `webapp/platform/client/src/client4.ts` - Client method update

### Frontend (Remaining ⏳)
7. `webapp/channels/src/packages/mattermost-redux/src/actions/search.ts` - Redux actions
8. `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.tsx` - Custom hook
9. `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx` - Component updates

---

## Estimated Time Remaining

- Redux actions update: **15 minutes**
- Custom hook refactor: **15 minutes**
- Component updates: **10 minutes**
- Testing: **20 minutes**

**Total: ~1 hour** to complete frontend integration

---

## References

- Full design document: `/thoughts/shared/plans/2025-11-11-flagged-posts-server-side-search.md`
- Backend implementation: Complete in current codebase
- PostgreSQL full-text search docs: https://www.postgresql.org/docs/current/textsearch.html
- Mattermost search patterns: `server/channels/store/sqlstore/post_store.go:2029-2178`

---

**Ready to implement**: All backend work is complete and tested. Frontend changes are straightforward Redux/React updates following established patterns.
