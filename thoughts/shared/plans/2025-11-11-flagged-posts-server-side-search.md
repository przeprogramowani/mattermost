# Flagged Posts Server-Side Search Implementation Plan

## Critical Analysis: Why Client-Side Search is Wrong

### Fundamental Flaws in the Local Search Plan

The original plan (`2025-11-11-flagged-posts-local-search.md`) implemented **client-side filtering**, which has these critical problems:

1. **Only searches loaded posts**: With pagination (60 posts per page), users with 100+ flagged posts can only search the 60 currently loaded posts, not all their flagged posts
2. **Inconsistent with pagination**: Loading more posts doesn't help - search still only filters what's in memory
3. **Poor user experience**: User searches for "meeting" and gets no results, but the post they're looking for is in the database on page 3
4. **Performance issues**: Client must load ALL flagged posts into memory to search effectively, defeating pagination
5. **Not scalable**: Users with 1000+ flagged posts would need to load all 1000 to search
6. **Inconsistent with Mattermost patterns**: All other search in Mattermost is server-side with PostgreSQL full-text search

### Example of the Problem

```
Server has 150 flagged posts
User opens Saved Posts → loads posts 1-60
User searches "important meeting"
  → Client filters posts 1-60 → finds 0 results
  → But post #85 contains "important meeting"!
User thinks they don't have any results, but they do - just not loaded!
```

### The Right Approach: Server-Side Search

Mattermost already has robust server-side search infrastructure:
- PostgreSQL full-text search with `to_tsvector()` and `to_tsquery()`
- Efficient indexing and query optimization
- Combines search with channel membership filtering
- Supports pagination with search results

**We must follow the same pattern for flagged posts.**

---

## Overview

Implement server-side search for flagged posts by adding an optional `terms` query parameter to the existing `/api/v4/users/{user_id}/posts/flagged` endpoint. When provided, the backend will filter flagged posts by text content using PostgreSQL full-text search, combined with existing pagination support.

## Architectural Approach

### Design Decision: Enhance Existing Endpoint vs New Endpoint

**Option A: Add `terms` parameter to existing GET endpoint** ✅ **CHOSEN**
```
GET /api/v4/users/{user_id}/posts/flagged?terms=meeting&page=0&per_page=60
```
- Pros: Backward compatible, simple, follows REST semantics for GET with filtering
- Pros: Existing pagination works seamlessly
- Pros: Minimal changes needed
- Cons: Limited to simple text search (but sufficient for MVP)

**Option B: Create new POST endpoint for search**
```
POST /api/v4/users/{user_id}/posts/flagged/search
Body: {terms: "meeting", page: 0, per_page: 60}
```
- Pros: Follows Mattermost search pattern
- Pros: Can support advanced search parameters later
- Cons: More complex, duplicates endpoint logic
- Cons: Frontend needs to handle two different endpoints

**Decision: Option A** - Add optional `terms` parameter to existing endpoint for simplicity and backward compatibility.

---

## Implementation Plan

### Phase 1: Backend Changes

#### 1. Update SQL Store Method

**File**: `server/channels/store/sqlstore/post_store.go`

**Modify `getFlaggedPosts` signature** (line 490):
```go
func (s *SqlPostStore) getFlaggedPosts(userId, channelId, teamId string, offset int, limit int, terms string) (*model.PostList, error) {
```

**Add search clause** (after line 518, before CHANNEL_FILTER):
```go
    searchClause := ""
    if terms != "" {
        // Use PostgreSQL full-text search for text matching
        // Simple configuration for basic text search without stemming
        searchClause = "AND to_tsvector('simple', Posts.Message) @@ plainto_tsquery('simple', ?)"
    }
```

**Update query string** (replace CHANNEL_FILTER marker, line 523):
```go
    query = strings.Replace(query, "CHANNEL_FILTER", channelFilters + " " + searchClause, 1)
```

**Update queryParams** (after adding channelId if present):
```go
    if terms != "" {
        queryParams = append(queryParams, terms)
    }
```

**Update wrapper methods** (lines 478-486):
```go
func (s *SqlPostStore) GetFlaggedPosts(userId string, offset int, limit int, terms string) (*model.PostList, error) {
    return s.getFlaggedPosts(userId, "", "", offset, limit, terms)
}

func (s *SqlPostStore) GetFlaggedPostsForTeam(userId, teamId string, offset int, limit int, terms string) (*model.PostList, error) {
    return s.getFlaggedPosts(userId, "", teamId, offset, limit, terms)
}

func (s *SqlPostStore) GetFlaggedPostsForChannel(userId, channelId string, offset int, limit int, terms string) (*model.PostList, error) {
    return s.getFlaggedPosts(userId, channelId, "", offset, limit, terms)
}
```

#### 2. Update Store Interface

**File**: `server/channels/store/store.go`

**Update interface methods** (lines 379-381):
```go
GetFlaggedPosts(userID string, offset int, limit int, terms string) (*model.PostList, error)
GetFlaggedPostsForTeam(userID, teamID string, offset int, limit int, terms string) (*model.PostList, error)
GetFlaggedPostsForChannel(userID, channelID string, offset int, limit int, terms string) (*model.PostList, error)
```

#### 3. Regenerate Store Layers

**Command**:
```bash
cd server/channels/store && go generate
```

This regenerates timer, retry, and other wrapper layers to match the updated interface.

#### 4. Update App Layer

**File**: `server/channels/app/post.go`

**Update method signatures** (lines 1105, 1119, 1133):
```go
func (a *App) GetFlaggedPosts(userID string, offset int, limit int, terms string) (*model.PostList, *model.AppError) {
    postList, err := a.Srv().Store().Post().GetFlaggedPosts(userID, offset, limit, terms)
    // ... rest unchanged
}

func (a *App) GetFlaggedPostsForTeam(userID, teamID string, offset int, limit int, terms string) (*model.PostList, *model.AppError) {
    postList, err := a.Srv().Store().Post().GetFlaggedPostsForTeam(userID, teamID, offset, limit, terms)
    // ... rest unchanged
}

func (a *App) GetFlaggedPostsForChannel(userID, channelID string, offset int, limit int, terms string) (*model.PostList, *model.AppError) {
    postList, err := a.Srv().Store().Post().GetFlaggedPostsForChannel(userID, channelID, offset, limit, terms)
    // ... rest unchanged
}
```

#### 5. Update API Handler

**File**: `server/channels/api4/post.go`

**Update `getFlaggedPostsForUser` handler** (line 349):
```go
func getFlaggedPostsForUser(c *Context, w http.ResponseWriter, r *http.Request) {
    c.RequireUserId()
    if c.Err != nil {
        return
    }

    if !c.App.SessionHasPermissionToUser(*c.AppContext.Session(), c.Params.UserId) {
        c.SetPermissionError(model.PermissionEditOtherUsers)
        return
    }

    channelId := r.URL.Query().Get("channel_id")
    teamId := r.URL.Query().Get("team_id")
    terms := r.URL.Query().Get("terms")  // ADD THIS LINE

    // Convert page to offset
    offset := c.Params.Page * c.Params.PerPage
    limit := c.Params.PerPage

    var posts *model.PostList
    var err *model.AppError

    // Update all three calls to pass terms
    if channelId != "" {
        posts, err = c.App.GetFlaggedPostsForChannel(c.Params.UserId, channelId, offset, limit, terms)
    } else if teamId != "" {
        posts, err = c.App.GetFlaggedPostsForTeam(c.Params.UserId, teamId, offset, limit, terms)
    } else {
        posts, err = c.App.GetFlaggedPosts(c.Params.UserId, offset, limit, terms)
    }

    if err != nil {
        c.Err = err
        return
    }

    // ... rest of handler unchanged
}
```

#### 6. Update API Documentation

**File**: `api/v4/source/posts.yaml`

**Add `terms` parameter** (after line 475):
```yaml
- name: terms
  in: query
  description: Search query to filter flagged posts by message content
  schema:
    type: string
```

---

### Phase 2: Frontend Changes

#### 7. Update Client4 Method

**File**: `webapp/platform/client/src/client4.ts`

**Update `getFlaggedPosts` method** (lines 2397-2402):
```typescript
getFlaggedPosts = (userId: string, channelId = '', teamId = '', page = 0, perPage = PER_PAGE_DEFAULT, terms = '') => {
    return this.doFetch<PostList>(
        `${this.getUserRoute(userId)}/posts/flagged${buildQueryString({
            channel_id: channelId,
            team_id: teamId,
            page,
            per_page: perPage,
            terms,
        })}`,
        {method: 'get'},
    );
};
```

#### 8. Update Redux Actions

**File**: `webapp/packages/mattermost-redux/src/actions/search.ts`

**Update `getFlaggedPosts` action** (lines 230-262):
```typescript
export function getFlaggedPosts(terms = ''): ActionFuncAsync<PostList> {
    return async (dispatch, getState) => {
        const state = getState();
        const userId = getCurrentUserId(state);

        dispatch({type: SearchTypes.SEARCH_FLAGGED_POSTS_REQUEST});

        let posts;
        try {
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
                    params: {page: 0, per_page: 60, terms},
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
```

**Update `getMoreFlaggedPosts` action** (around line 264):
```typescript
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
            posts = await Client4.getFlaggedPosts(
                userId,
                '',
                '',
                newParams.page,
                newParams.per_page,
                newParams.terms || '',  // Pass search terms to pagination
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

#### 9. Update Custom Hook to Call Redux Action

**File**: `webapp/channels/src/components/flagged_posts_container/use_flagged_posts_search.tsx`

**Replace entire implementation**:
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

    // Debounce search term updates and trigger server search
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

#### 10. Update Component to Use Server-Side Search

**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx`

**Update hook usage** (line 48-55):
```typescript
// Search functionality (server-side)
const {
    inputValue,
    searchTerm,
    searchInputSuffix,
    handleInputChange,
} = useFlaggedPostsSearch();  // Remove posts parameter - no longer does client-side filtering
```

**Update to use all posts directly** (line 191):
```typescript
<PostListCore
    items={posts}  // Use all posts - server handles filtering
    renderItem={renderItem}
    renderEmpty={renderEmpty}
    renderLoading={renderLoading}
    renderLoadingMore={renderLoadingMore}
    isLoading={isLoading}
    isLoadingMore={isLoadingMore}
    showLoadMore={showLoadMore}  // Keep existing logic
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

**Remove client-side pagination disable logic** (lines 65-75 and 165):
- Remove the `searchTerm.trim() === ''` condition from `handleScroll` and `showLoadMore`
- Server now handles search + pagination together

---

### Phase 3: Testing

#### Backend Testing

**Unit Tests** (`server/channels/store/storetest/post_store.go`):
```go
func testGetFlaggedPostsWithSearch(t *testing.T, rctx request.CTX, ss store.Store) {
    // Test search filtering works correctly
    // Test empty search returns all flagged posts
    // Test search with no matches returns empty
    // Test search is case-insensitive
    // Test pagination works with search
}
```

**Integration Tests**:
- Test API endpoint with `terms` parameter
- Test backward compatibility (no `terms` parameter)
- Test terms + pagination combination
- Test terms + channel_id filter
- Test terms + team_id filter

#### Frontend Testing

**Redux Action Tests**:
- Test `getFlaggedPosts('')` loads all posts
- Test `getFlaggedPosts('meeting')` passes terms to API
- Test `getMoreFlaggedPosts()` preserves search terms across pages
- Test pagination state includes terms

**Component Tests**:
- Test typing in search input dispatches action after debounce
- Test clear button resets search and reloads posts
- Test pagination works with active search

#### Manual Testing Scenarios

1. **Basic Search**:
   - Flag 100 posts with varying content
   - Search for "meeting" → verify all matching posts appear (not just first 60)
   - Verify pagination works with search active

2. **Search + Pagination**:
   - Flag 150 posts, 30 contain "project"
   - Search "project" → verify first 30 results
   - Scroll to load more → verify pagination is disabled (all 30 loaded on first page)

3. **Empty Search**:
   - Search for "xyznonexistent" → verify empty state shows "No results found"
   - Clear search → verify all flagged posts return

4. **Clear Functionality**:
   - Enter search term → see filtered results
   - Click clear button → verify all posts reload

5. **Performance**:
   - Flag 1000 posts
   - Search "test" → verify response time < 200ms
   - Verify database uses indexes (EXPLAIN ANALYZE)

---

## SQL Query Performance

### Index Utilization

PostgreSQL will use:
1. **Preferences table index**: Composite key on `(UserId, Category, Name)` for flagged posts lookup
2. **Posts table primary key**: For joining preferences to posts
3. **Full-text search**: `to_tsvector` creates temporary search vector (consider adding GIN index if slow)
4. **ChannelMembers index**: For channel membership check

### Query Plan Analysis

Run EXPLAIN ANALYZE to verify:
```sql
EXPLAIN ANALYZE
SELECT A.*, (SELECT count(*) FROM Posts WHERE Posts.RootId = (CASE WHEN A.RootId = '' THEN A.Id ELSE A.RootId END) AND Posts.DeleteAt = 0) as ReplyCount
FROM (
    SELECT * FROM Posts
    WHERE Id IN (SELECT Name FROM Preferences WHERE UserId = 'user123' AND Category = 'flagged_post')
    AND DeleteAt = 0
    AND to_tsvector('simple', Message) @@ plainto_tsquery('simple', 'meeting')
) as A
INNER JOIN Channels as B ON B.Id = A.ChannelId
WHERE ChannelId IN (SELECT ChannelId FROM ChannelMembers WHERE UserId = 'user123')
ORDER BY CreateAt DESC
LIMIT 60 OFFSET 0;
```

### Optional: Add GIN Index for Full-Text Search

If search performance is slow (>100ms for 1000+ flagged posts), add:
```sql
CREATE INDEX idx_posts_message_gin ON Posts USING GIN (to_tsvector('simple', Message));
```

This would make full-text search nearly instantaneous even with millions of posts.

---

## Migration and Rollout

### Backward Compatibility

- ✅ Endpoint remains GET (no breaking change)
- ✅ `terms` parameter is optional
- ✅ Old clients work without changes
- ✅ New clients work with old servers (terms ignored, acts like no search)

### Deployment Strategy

1. **Deploy backend first**: Servers accept `terms` parameter but old clients don't send it
2. **Deploy frontend**: Clients start sending `terms`, servers process it
3. **Monitor**: Watch query performance metrics
4. **Optimize if needed**: Add GIN index if search is slow

### Rollback Plan

- Backend changes are backward compatible, safe to leave deployed
- Frontend rollback: Revert to previous version (degrades to client-side search)
- No database migrations, so no rollback needed there

---

## Success Criteria

### Functional Requirements

- ✅ User can search all flagged posts, not just loaded ones
- ✅ Search works across pagination boundaries
- ✅ Search is performant (<200ms for 1000 posts)
- ✅ Empty search returns all flagged posts
- ✅ Search + pagination work together
- ✅ Clear button resets search

### Performance Requirements

- Query execution time: <100ms (typical), <200ms (worst case with 1000+ posts)
- Frontend responsiveness: Search triggers after 300ms debounce
- No N+1 queries
- Uses database indexes efficiently

### User Experience Requirements

- Search feels instant (debounced, but responsive)
- Results are accurate (matches all flagged posts)
- Pagination state is preserved during search
- Clear indication when no results found

---

## Comparison: Client-Side vs Server-Side

| Aspect | Client-Side (OLD ❌) | Server-Side (NEW ✅) |
|--------|---------------------|---------------------|
| **Searches all posts** | No, only loaded posts | Yes, entire database |
| **Works with pagination** | No, conflicts | Yes, seamlessly |
| **Performance** | Good for small sets | Excellent for any size |
| **Scalability** | Poor (must load all) | Excellent (DB indexed) |
| **Consistency** | Inconsistent with app | Consistent with app |
| **Database load** | None (client CPU) | Minimal (indexed query) |
| **User experience** | Confusing (missing results) | Accurate and complete |

---

## References

### Mattermost Search Implementation
- Search posts endpoint: `server/channels/api4/post.go:776-849`
- Search SQL implementation: `server/channels/store/sqlstore/post_store.go:2029-2178`
- Search Redux actions: `webapp/packages/mattermost-redux/src/actions/search.ts:69-141`

### Flagged Posts Implementation
- API handler: `server/channels/api4/post.go:349-434`
- Store implementation: `server/channels/store/sqlstore/post_store.go:490-555`
- Redux actions: `webapp/packages/mattermost-redux/src/actions/search.ts:230-262`

### Related Plans
- Pagination plan: `thoughts/shared/plans/2025-11-11-flagged-posts-pagination.md`
- Local search plan (DEPRECATED): `thoughts/shared/plans/2025-11-11-flagged-posts-local-search.md`

---

## Implementation Timeline

- **Backend changes**: 2-3 hours
  - SQL query update: 30 min
  - Store/app layer updates: 30 min
  - API handler update: 30 min
  - Testing: 1 hour

- **Frontend changes**: 1-2 hours
  - Client4 method: 15 min
  - Redux actions: 30 min
  - Hook refactor: 30 min
  - Testing: 30 min

- **Integration testing**: 1 hour

**Total: 4-6 hours** (vs 8+ hours to debug and fix the client-side approach)

---

**Status**: Ready for implementation
**Risk Level**: Low (follows established patterns, backward compatible)
**Impact**: High (fixes fundamental architectural flaw)
