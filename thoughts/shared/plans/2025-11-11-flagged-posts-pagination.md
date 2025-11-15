# Flagged Posts Scroll-Based Pagination Implementation Plan

## Overview

Fix the confirmed bug where users with 61+ saved posts can only access the most recent 60 posts. The backend already fully supports pagination, but the frontend explicitly disables infinite scroll for flagged posts and only fetches the first page. This plan implements scroll-based pagination with total count display and improved loading states to match the existing search results UX pattern.

## Current State Analysis

### The Bug
- Users can flag unlimited posts, but only the **most recent 60** are visible in the Saved Posts panel
- Posts are sorted by `CreateAt DESC` (newest first)
- The 61st post and beyond are not accessible - no scroll loading, no pagination controls
- Confirmed in `TICKET.md` and research document

### Root Cause
1. **Redux action only fetches first page**: `getFlaggedPosts()` calls API with default parameters (`page=0, per_page=60`)
2. **Infinite scroll explicitly disabled**: Line 83 in `search_results.tsx` checks `!props.isFlaggedPosts`
3. **Loading indicator hidden**: Line 145 in `search_results.tsx` checks `!isFlaggedPosts`
4. **No "get more" action exists**: Unlike search results which have `getMorePostsForSearch()`, there's no equivalent for flagged posts
5. **No pagination state tracked**: Redux doesn't track page number or `isEnd` flag for flagged posts

### What Already Works
- ✅ Backend API fully supports pagination (`page` and `per_page` query parameters)
- ✅ Store layer has `offset` and `limit` parameters
- ✅ SQL queries implement `LIMIT ? OFFSET ?` correctly
- ✅ Permission filtering works (app layer filters inaccessible posts)
- ✅ API client method supports all parameters
- ✅ Search results have a working infinite scroll pattern to replicate

### Key Discoveries
- Backend requires NO changes for basic pagination
- Pattern already exists in `getMorePostsForSearch()` action (webapp/packages/mattermost-redux/src/actions/search.ts:143-153)
- Loading states follow established pattern in search results component
- Redux state structure needs pagination tracking similar to search

## Desired End State

### Functional Requirements
1. **Infinite scroll works for flagged posts**: Users can scroll to load more posts automatically
2. **Total count displayed**: UI shows "Showing X of Y saved messages"
3. **Loading indicators**: Spinner displays when fetching more posts
4. **End detection**: System stops trying to load when all posts are fetched
5. **Error handling**: Graceful degradation if pagination fails

### Success Verification

After implementation, verify:
- User with 100 saved posts can scroll through all of them
- Total count displays correctly and updates as posts are flagged/unflagged
- Loading spinner appears at bottom while fetching next page
- Scrolling performance remains smooth (no jank)
- No duplicate posts appear
- No unnecessary API calls (only one request in flight at a time)

## What We're NOT Doing

To prevent scope creep, explicitly out of scope:
- ❌ Search/filter functionality within saved posts (future enhancement)
- ❌ Traditional prev/next pagination controls (infinite scroll only)
- ❌ Virtual scrolling for performance optimization (can add later if needed)
- ❌ Bulk actions (select multiple posts to unflag)
- ❌ Collections/tags for organizing saved posts
- ❌ Filter by channel/team UI (backend supports it, but no UI for now)
- ❌ Export functionality
- ❌ Keyboard navigation improvements
- ❌ Caching layer (can add later if performance issues arise)

## Implementation Approach

**Strategy**: Follow the existing `getMorePostsForSearch` pattern exactly, adapting it for flagged posts. This ensures consistency with the codebase and minimal risk.

**Key Principles**:
1. **Backend-first mindset**: Backend already works, focus on frontend
2. **Incremental delivery**: Three phases with clear success criteria
3. **Pattern replication**: Copy what works in search results
4. **Backward compatibility**: No breaking changes to existing functionality

---

## Phase 1: Enable Infinite Scroll Pagination

### Overview
Implement the core pagination functionality to fix the 60-post limit bug. This phase replicates the infinite scroll pattern from search results.

### Changes Required

#### 1. Create New Redux Action: `getMoreFlaggedPosts()`

**File**: `webapp/packages/mattermost-redux/src/actions/search.ts`

**Add after line 262** (after `getFlaggedPosts` function):

```typescript
export function getMoreFlaggedPosts(): ActionFuncAsync<PostList> {
    return async (dispatch, getState) => {
        const state = getState();
        const userId = getCurrentUserId(state);
        const {params, isFlaggedEnd} = state.entities.search.flaggedPostsPagination || {
            params: {page: 0, per_page: 60},
            isFlaggedEnd: false,
        };

        // Don't fetch if we've reached the end
        if (isFlaggedEnd) {
            return {data: true};
        }

        // Prepare next page parameters
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
                '', // channelId
                '', // teamId
                newParams.page,
                newParams.per_page,
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

        // Detect end of results
        const isEnd = posts.order.length < newParams.per_page;

        dispatch(batchActions([
            {
                type: SearchTypes.RECEIVED_SEARCH_FLAGGED_POSTS,
                data: posts,
                isGettingMore: true, // Important: tells reducer to append
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

#### 2. Update Initial `getFlaggedPosts()` Action

**File**: `webapp/packages/mattermost-redux/src/actions/search.ts`

**Replace lines 230-262** with:

```typescript
export function getFlaggedPosts(): ActionFuncAsync<PostList> {
    return async (dispatch, getState) => {
        const state = getState();
        const userId = getCurrentUserId(state);

        dispatch({type: SearchTypes.SEARCH_FLAGGED_POSTS_REQUEST});

        let posts;
        try {
            // Fetch first page
            posts = await Client4.getFlaggedPosts(userId, '', '', 0, 60);

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

        // Detect if first page is also last page
        const isEnd = posts.order.length < 60;

        dispatch(batchActions([
            {
                type: SearchTypes.RECEIVED_SEARCH_FLAGGED_POSTS,
                data: posts,
                isGettingMore: false, // Initial load, replace results
            },
            receivedPosts(posts),
            {
                type: SearchTypes.UPDATE_FLAGGED_POSTS_PAGINATION,
                data: {
                    params: {page: 0, per_page: 60},
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

#### 3. Add New Action Types

**File**: `webapp/packages/mattermost-redux/src/action_types/search.ts`

**Add after line 15**:

```typescript
GET_MORE_FLAGGED_POSTS_REQUEST: null,
GET_MORE_FLAGGED_POSTS_SUCCESS: null,
GET_MORE_FLAGGED_POSTS_FAILURE: null,
UPDATE_FLAGGED_POSTS_PAGINATION: null,
```

#### 4. Update Flagged Posts Reducer to Support Append Mode

**File**: `webapp/packages/mattermost-redux/src/reducers/entities/search.ts`

**Replace the `flagged` reducer (lines 82-142)** with:

```typescript
function flagged(state: string[] = [], action: MMReduxAction) {
    switch (action.type) {
    case SearchTypes.RECEIVED_SEARCH_FLAGGED_POSTS: {
        if (action.isGettingMore) {
            // Append new results, remove duplicates
            return [...new Set(state.concat(action.data.order))];
        }
        // Replace results (initial load)
        return action.data.order;
    }
    case PreferenceTypes.RECEIVED_PREFERENCES: {
        if (!action.data) {
            return state;
        }

        const nextFlagged = [...state];
        let changed = false;
        action.data.forEach((pref: PreferenceType) => {
            if (pref.category === Preferences.CATEGORY_FLAGGED_POST) {
                const exists = nextFlagged.indexOf(pref.name);
                if (exists === -1) {
                    nextFlagged.push(pref.name);
                    changed = true;
                }
            }
        });
        return changed ? nextFlagged : state;
    }
    case PreferenceTypes.DELETED_PREFERENCES: {
        if (!action.data) {
            return state;
        }

        const nextFlagged = [...state];
        let changed = false;
        action.data.forEach((pref: PreferenceType) => {
            if (pref.category === Preferences.CATEGORY_FLAGGED_POST) {
                const index = nextFlagged.indexOf(pref.name);
                if (index !== -1) {
                    nextFlagged.splice(index, 1);
                    changed = true;
                }
            }
        });
        return changed ? nextFlagged : state;
    }
    case PostTypes.POST_REMOVED: {
        const index = state.indexOf(action.data.id);
        if (index === -1) {
            return state;
        }

        const nextFlagged = [...state];
        nextFlagged.splice(index, 1);
        return nextFlagged;
    }
    case UserTypes.LOGOUT_SUCCESS:
        return [];
    default:
        return state;
    }
}
```

#### 5. Add New Reducer for Flagged Posts Pagination State

**File**: `webapp/packages/mattermost-redux/src/reducers/entities/search.ts`

**Add before the `export default combineReducers` line (~line 265)**:

```typescript
function flaggedPostsPagination(state: any = {}, action: MMReduxAction) {
    switch (action.type) {
    case SearchTypes.UPDATE_FLAGGED_POSTS_PAGINATION:
        return action.data;
    case UserTypes.LOGOUT_SUCCESS:
        return {};
    default:
        return state;
    }
}
```

**Update the export at bottom of file** to include new reducer:

```typescript
export default combineReducers({
    results,
    fileResults,
    flagged,
    flaggedPostsPagination, // ADD THIS LINE
    current,
    matches,
    recent,
    isSearchingTerm,
    isSearchGettingMore,
});
```

#### 6. Add Loading State Reducer for Pagination

**File**: `webapp/packages/mattermost-redux/src/reducers/entities/search.ts`

**Add after `isSearchGettingMore` reducer (~line 248)**:

```typescript
function isGettingMoreFlaggedPosts(state = false, action: MMReduxAction) {
    switch (action.type) {
    case SearchTypes.GET_MORE_FLAGGED_POSTS_REQUEST:
        return true;
    case SearchTypes.GET_MORE_FLAGGED_POSTS_SUCCESS:
    case SearchTypes.GET_MORE_FLAGGED_POSTS_FAILURE:
        return false;
    default:
        return state;
    }
}
```

**Update export**:

```typescript
export default combineReducers({
    // ... existing reducers ...
    isSearchGettingMore,
    isGettingMoreFlaggedPosts, // ADD THIS LINE
});
```

#### 7. Remove Infinite Scroll Blockers in Component

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Line 83**: Change the condition from:

```typescript
if (!props.isFlaggedPosts && !props.isPinnedPosts && !props.isSearchingTerm && !props.isSearchGettingMore && !props.isChannelFiles) {
```

to:

```typescript
if (!props.isPinnedPosts && !props.isSearchingTerm && !props.isSearchGettingMore && !props.isChannelFiles && !props.isGettingMoreFlaggedPosts) {
```

**Line 145**: Change from:

```typescript
const showLoadMore = !isAtEnd && !isChannelFiles && !isFlaggedPosts && !isPinnedPosts;
```

to:

```typescript
const showLoadMore = !isAtEnd && !isChannelFiles && !isPinnedPosts;
```

#### 8. Update Scroll Handler to Call Appropriate Action

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Replace lines 86-92** with:

```typescript
if ((scrollTop + clientHeight + GET_MORE_BUFFER) >= scrollHeight) {
    if (searchType === DataSearchTypes.FILES_SEARCH_TYPE) {
        loadMoreFiles();
    } else if (props.isFlaggedPosts) {
        loadMoreFlaggedPosts(); // NEW
    } else {
        loadMorePosts();
    }
}
```

**Add debounced function** (after `loadMorePosts` around line 108):

```typescript
const loadMoreFlaggedPosts = debounce(
    () => {
        props.getMoreFlaggedPosts();
    },
    100,
    false,
    (): void => {},
);
```

#### 9. Add Selector for Flagged Posts Pagination State

**File**: `webapp/channels/src/selectors/rhs.ts`

**Add after line 161**:

```typescript
export function getIsGettingMoreFlaggedPosts(state: GlobalState): boolean {
    return state.entities.search.isGettingMoreFlaggedPosts || false;
}

export function getFlaggedPostsPagination(state: GlobalState) {
    return state.entities.search.flaggedPostsPagination || {
        params: {page: 0, per_page: 60},
        isFlaggedEnd: false,
    };
}
```

#### 10. Wire Up Action in Container

**File**: `webapp/channels/src/components/search_results/index.tsx`

**Update `mapStateToProps`** (around line 50):

```typescript
isGettingMoreFlaggedPosts: getIsGettingMoreFlaggedPosts(state),
isFlaggedAtEnd: getFlaggedPostsPagination(state).isFlaggedEnd,
```

**File**: `webapp/channels/src/components/search/index.tsx` or parent container

**Add to `mapDispatchToProps`** (around line 85):

```typescript
getMoreFlaggedPosts,
```

**Add to component props** and pass to SearchResults.

#### 11. Update TypeScript Types

**File**: `webapp/channels/src/components/search_results/types.ts`

**Add to StateProps**:

```typescript
isGettingMoreFlaggedPosts: boolean;
isFlaggedAtEnd: boolean;
```

**Add to OwnProps**:

```typescript
getMoreFlaggedPosts: () => void;
```

### Success Criteria

#### Automated Verification:
- [x] TypeScript compilation passes: `cd webapp && npm run check-types`
- [ ] ESLint passes: `cd webapp && npm run check` (one minor formatting issue to fix)
- [ ] Unit tests pass: `cd webapp && npm test`
- [ ] Redux action tests pass for new actions
- [ ] Reducer tests pass for pagination state
- [x] Backend build passes: `cd server && make build`
- [x] Fixed backend bug: API handler now correctly converts page→offset

#### Manual Verification:
- [ ] Create 61+ flagged posts in a test account
- [ ] Open Saved Posts panel
- [ ] Scroll to bottom - verify automatic loading of next 60 posts
- [ ] Continue scrolling - verify all posts are accessible
- [ ] Verify no duplicate posts appear
- [ ] Verify loading stops when all posts are loaded
- [ ] Verify no errors in browser console
- [ ] Flag a new post - verify it appears at the top without breaking pagination
- [ ] Unflag a post from the first page - verify pagination still works
- [ ] Unflag a post from a later page - verify no issues

**Bug Fixes Applied:**
- [x] Backend: Fixed API handler to correctly convert page→offset (page * perPage)
- [x] Frontend: Created getFlaggedPosts selector to read from state.entities.search.flagged
- [x] Frontend: Updated mapStateToProps to use getFlaggedPosts when isFlaggedPosts is true
- [x] Frontend: Fixed loading indicator to work with flagged posts pagination
- [x] Frontend: Fixed end state detection to include isFlaggedAtEnd in isAtEnd calculation
- [x] Frontend: Fixed missing matches prop by providing empty array fallback for flagged posts

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Add Total Count Display

### Overview
Add backend support for returning the total count of flagged posts and display "Showing X of Y saved messages" in the UI.

### Changes Required

#### Backend Changes

##### 1. Add PostListWithCount Model

**File**: `server/public/model/post_list.go`

**Add after the PostList struct definition**:

```go
type PostListWithCount struct {
    PostList   *PostList `json:"post_list"`
    TotalCount int64     `json:"total_count"`
}
```

##### 2. Add Store Interface Methods

**File**: `server/channels/store/store.go`

**Add after line 381** (after GetFlaggedPostsForChannel):

```go
GetFlaggedPostsCount(userID string) (int64, error)
GetFlaggedPostsForTeamCount(userID, teamID string) (int64, error)
GetFlaggedPostsForChannelCount(userID, channelID string) (int64, error)
```

##### 3. Implement Count Methods in SQL Store

**File**: `server/channels/store/sqlstore/post_store.go`

**Add after line 488** (after GetFlaggedPostsForChannel implementation):

```go
func (s *SqlPostStore) GetFlaggedPostsCount(userID string) (int64, error) {
    return s.getFlaggedPostsCount(userID, "", "")
}

func (s *SqlPostStore) GetFlaggedPostsForTeamCount(userID, teamID string) (int64, error) {
    return s.getFlaggedPostsCount(userID, "", teamID)
}

func (s *SqlPostStore) GetFlaggedPostsForChannelCount(userID, channelID string) (int64, error) {
    return s.getFlaggedPostsCount(userID, channelID, "")
}

func (s *SqlPostStore) getFlaggedPostsCount(userId, channelId, teamId string) (int64, error) {
    query := `
        SELECT COUNT(DISTINCT A.Id)
        FROM (
            SELECT *
            FROM Posts
            WHERE Id IN (
                SELECT Name FROM Preferences
                WHERE UserId = ? AND Category = ?
            )
            CHANNEL_FILTER
            AND Posts.DeleteAt = 0
        ) as A
        INNER JOIN Channels as B ON B.Id = A.ChannelId
        WHERE A.ChannelId IN (
            SELECT ChannelId FROM ChannelMembers WHERE UserId = ?
        )
        TEAM_FILTER
    `

    queryParams := []any{userId, model.PreferenceCategoryFlaggedPost}

    // Build channel filter
    channelFilters := ""
    if channelId != "" {
        channelFilters = "AND Posts.ChannelId = ?"
        queryParams = append(queryParams, channelId)
    }

    // Add userId for channel membership check
    queryParams = append(queryParams, userId)

    // Build team filter
    teamFilters := ""
    if teamId != "" {
        teamFilters = "AND B.TeamId = ?"
        queryParams = append(queryParams, teamId)
    }

    query = strings.Replace(query, "CHANNEL_FILTER", channelFilters, 1)
    query = strings.Replace(query, "TEAM_FILTER", teamFilters, 1)

    var count int64
    if err := s.GetReplicaX().Get(&count, query, queryParams...); err != nil {
        return 0, errors.Wrap(err, "failed to count flagged posts")
    }

    return count, nil
}
```

##### 4. Regenerate Store Layers

**Command**: Run from server directory:

```bash
cd server/channels/store && go generate
```

This regenerates timer and retry layers to wrap the new methods.

##### 5. Add App Layer Methods

**File**: `server/channels/app/post.go`

**Add after line 1133** (after GetFlaggedPostsForChannel):

```go
func (a *App) GetFlaggedPostsWithCount(userId string, offset int, limit int) (*model.PostListWithCount, *model.AppError) {
    posts, err := a.GetFlaggedPosts(userId, offset, limit)
    if err != nil {
        return nil, err
    }

    totalCount, countErr := a.Srv().Store().Post().GetFlaggedPostsCount(userId)
    if countErr != nil {
        return nil, model.NewAppError("GetFlaggedPostsWithCount", "app.post.get_flagged_posts_count.app_error", nil, "", http.StatusInternalServerError).Wrap(countErr)
    }

    return &model.PostListWithCount{
        PostList:   posts,
        TotalCount: totalCount,
    }, nil
}

func (a *App) GetFlaggedPostsForTeamWithCount(userId, teamId string, offset int, limit int) (*model.PostListWithCount, *model.AppError) {
    posts, err := a.GetFlaggedPostsForTeam(userId, teamId, offset, limit)
    if err != nil {
        return nil, err
    }

    totalCount, countErr := a.Srv().Store().Post().GetFlaggedPostsForTeamCount(userId, teamId)
    if countErr != nil {
        return nil, model.NewAppError("GetFlaggedPostsForTeamWithCount", "app.post.get_flagged_posts_for_team_count.app_error", nil, "", http.StatusInternalServerError).Wrap(countErr)
    }

    return &model.PostListWithCount{
        PostList:   posts,
        TotalCount: totalCount,
    }, nil
}

func (a *App) GetFlaggedPostsForChannelWithCount(userId, channelId string, offset int, limit int) (*model.PostListWithCount, *model.AppError) {
    posts, err := a.GetFlaggedPostsForChannel(userId, channelId, offset, limit)
    if err != nil {
        return nil, err
    }

    totalCount, countErr := a.Srv().Store().Post().GetFlaggedPostsForChannelCount(userId, channelId)
    if countErr != nil {
        return nil, model.NewAppError("GetFlaggedPostsForChannelWithCount", "app.post.get_flagged_posts_for_channel_count.app_error", nil, "", http.StatusInternalServerError).Wrap(countErr)
    }

    return &model.PostListWithCount{
        PostList:   posts,
        TotalCount: totalCount,
    }, nil
}
```

##### 6. Update API Handler to Support Total Count

**File**: `server/channels/api4/post.go`

**Replace lines 349-430** (getFlaggedPostsForUser function) with:

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

    var posts *model.PostList
    var totalCount int64
    var err *model.AppError

    if c.Params.IncludeTotalCount {
        // Return with total count
        var postsWithCount *model.PostListWithCount
        if channelId != "" {
            postsWithCount, err = c.App.GetFlaggedPostsForChannelWithCount(c.Params.UserId, channelId, c.Params.Page*c.Params.PerPage, c.Params.PerPage)
        } else if teamId != "" {
            postsWithCount, err = c.App.GetFlaggedPostsForTeamWithCount(c.Params.UserId, teamId, c.Params.Page*c.Params.PerPage, c.Params.PerPage)
        } else {
            postsWithCount, err = c.App.GetFlaggedPostsWithCount(c.Params.UserId, c.Params.Page*c.Params.PerPage, c.Params.PerPage)
        }

        if err != nil {
            c.Err = err
            return
        }

        posts = postsWithCount.PostList
        totalCount = postsWithCount.TotalCount
    } else {
        // Return without total count (backward compatible)
        if channelId != "" {
            posts, err = c.App.GetFlaggedPostsForChannel(c.Params.UserId, channelId, c.Params.Page*c.Params.PerPage, c.Params.PerPage)
        } else if teamId != "" {
            posts, err = c.App.GetFlaggedPostsForTeam(c.Params.UserId, teamId, c.Params.Page*c.Params.PerPage, c.Params.PerPage)
        } else {
            posts, err = c.App.GetFlaggedPosts(c.Params.UserId, c.Params.Page*c.Params.PerPage, c.Params.PerPage)
        }

        if err != nil {
            c.Err = err
            return
        }
    }

    if c.Params.IncludeTotalCount {
        js, err := json.Marshal(&model.PostListWithCount{
            PostList:   posts,
            TotalCount: totalCount,
        })
        if err != nil {
            c.Err = model.NewAppError("getFlaggedPostsForUser", "api.marshal_error", nil, "", http.StatusInternalServerError).Wrap(err)
            return
        }
        w.Write(js)
    } else {
        if c.HandleEtag(posts.Etag(), "Get Flagged Posts", w, r) {
            return
        }
        w.Header().Set(model.HeaderEtagServer, posts.Etag())
        w.Write([]byte(posts.ToJson()))
    }
}
```

#### Frontend Changes

##### 7. Update API Client to Support Total Count

**File**: `webapp/platform/client/src/client4.ts`

**Replace lines 2397-2402** with:

```typescript
getFlaggedPosts = (userId: string, channelId = '', teamId = '', page = 0, perPage = PER_PAGE_DEFAULT, includeTotalCount = false) => {
    return this.doFetch<PostList | PostListWithCount>(
        `${this.getUserRoute(userId)}/posts/flagged${buildQueryString({
            channel_id: channelId,
            team_id: teamId,
            page,
            per_page: perPage,
            include_total_count: includeTotalCount,
        })}`,
        {method: 'get'},
    );
};
```

##### 8. Add TypeScript Type for PostListWithCount

**File**: `webapp/packages/mattermost-redux/src/types/posts.ts`

**Add after PostList type**:

```typescript
export type PostListWithCount = {
    post_list: PostList;
    total_count: number;
};
```

##### 9. Update Redux Actions to Fetch Total Count

**File**: `webapp/packages/mattermost-redux/src/actions/search.ts`

**Update `getFlaggedPosts` action** (first fetch with count):

```typescript
export function getFlaggedPosts(): ActionFuncAsync<PostList> {
    return async (dispatch, getState) => {
        const state = getState();
        const userId = getCurrentUserId(state);

        dispatch({type: SearchTypes.SEARCH_FLAGGED_POSTS_REQUEST});

        let result;
        try {
            // Fetch first page WITH total count
            result = await Client4.getFlaggedPosts(userId, '', '', 0, 60, true);

            let posts;
            let totalCount = 0;

            if ('post_list' in result) {
                // Response includes total count
                posts = result.post_list;
                totalCount = result.total_count;
            } else {
                // Backward compatibility: plain PostList response
                posts = result;
            }

            await Promise.all([
                getMentionsAndStatusesForPosts(posts.posts, dispatch, getState),
                dispatch(getMissingChannelsFromPosts(posts.posts)),
            ]);

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
                        params: {page: 0, per_page: 60},
                        isFlaggedEnd: isEnd,
                        totalCount,
                    },
                },
                {
                    type: SearchTypes.SEARCH_FLAGGED_POSTS_SUCCESS,
                },
            ], 'SEARCH_FLAGGED_POSTS_BATCH'));

            return {data: posts};
        } catch (error) {
            forceLogoutIfNecessary(error, dispatch, getState);
            dispatch({
                type: SearchTypes.SEARCH_FLAGGED_POSTS_FAILURE,
                error,
            });
            return {error};
        }
    };
}
```

**Update `getMoreFlaggedPosts`** (subsequent fetches don't need count):

Keep as-is from Phase 1 - no need to fetch total count on every pagination request.

##### 10. Add Total Count Display to UI

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Add after the title** (around line 174):

```tsx
const renderHeader = () => {
    if (isFlaggedPosts) {
        const pagination = props.flaggedPostsPagination || {};
        const totalCount = pagination.totalCount || 0;
        const currentCount = props.results.filter((r) => typeof r !== 'string').length; // Exclude date separators

        return (
            <div className='sidebar--right__title'>
                <FormattedMessage
                    id='search_header.title5'
                    defaultMessage='Saved messages'
                />
                {totalCount > 0 && (
                    <div className='sidebar--right__subtitle'>
                        <FormattedMessage
                            id='search_header.flagged_posts_count'
                            defaultMessage='Showing {current} of {total}'
                            values={{
                                current: currentCount,
                                total: totalCount,
                            }}
                        />
                    </div>
                )}
            </div>
        );
    }

    // ... existing title logic for other views
};
```

**Update the render** to use the new header function.

##### 11. Add i18n Translation String

**File**: `webapp/channels/src/i18n/en.json`

**Add**:

```json
"search_header.flagged_posts_count": "Showing {current} of {total}"
```

##### 12. Update Component Props

**File**: `webapp/channels/src/components/search_results/index.tsx`

**Add to mapStateToProps**:

```typescript
flaggedPostsPagination: getFlaggedPostsPagination(state),
```

**File**: `webapp/channels/src/components/search_results/types.ts`

**Add to StateProps**:

```typescript
flaggedPostsPagination?: {
    params: {page: number; per_page: number};
    isFlaggedEnd: boolean;
    totalCount?: number;
};
```

##### 13. Update Total Count When Posts Are Flagged/Unflagged

**File**: `webapp/packages/mattermost-redux/src/reducers/entities/search.ts`

**Update `flaggedPostsPagination` reducer**:

```typescript
function flaggedPostsPagination(state: any = {}, action: MMReduxAction) {
    switch (action.type) {
    case SearchTypes.UPDATE_FLAGGED_POSTS_PAGINATION:
        return action.data;
    case PreferenceTypes.RECEIVED_PREFERENCES: {
        // User flagged a new post - increment total count
        if (!action.data || !state.totalCount) {
            return state;
        }

        const flaggedCount = action.data.filter(
            (pref: PreferenceType) => pref.category === Preferences.CATEGORY_FLAGGED_POST,
        ).length;

        if (flaggedCount === 0) {
            return state;
        }

        return {
            ...state,
            totalCount: state.totalCount + flaggedCount,
        };
    }
    case PreferenceTypes.DELETED_PREFERENCES: {
        // User unflagged a post - decrement total count
        if (!action.data || !state.totalCount) {
            return state;
        }

        const unflaggedCount = action.data.filter(
            (pref: PreferenceType) => pref.category === Preferences.CATEGORY_FLAGGED_POST,
        ).length;

        if (unflaggedCount === 0) {
            return state;
        }

        return {
            ...state,
            totalCount: Math.max(0, state.totalCount - unflaggedCount),
        };
    }
    case UserTypes.LOGOUT_SUCCESS:
        return {};
    default:
        return state;
    }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Backend tests pass: `cd server && make test-server`
- [ ] Go build succeeds: `cd server && make build`
- [ ] Go linting passes: `cd server && make golangci-lint`
- [ ] TypeScript compilation passes: `cd webapp && npm run check-types`
- [ ] Frontend tests pass: `cd webapp && npm test`
- [ ] API client tests pass
- [ ] Redux action tests pass for updated actions

#### Manual Verification:
- [ ] Open Saved Posts with 0 posts - verify no count shows or shows "0 of 0"
- [ ] Open Saved Posts with exactly 60 posts - verify shows "60 of 60"
- [ ] Open Saved Posts with 100 posts - verify shows "60 of 100" initially
- [ ] Scroll to load more - verify count updates to "100 of 100"
- [ ] Flag a new post - verify total count increments to "101 of 101"
- [ ] Unflag a post - verify total count decrements correctly
- [ ] Check browser network tab - verify `include_total_count=true` parameter is sent
- [ ] Verify backend returns total_count in response
- [ ] Verify no performance degradation (COUNT query should be fast due to indexes)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Improve Loading States

### Overview
Add polished loading indicators and better UX feedback when fetching more posts, matching the search results experience.

### Changes Required

#### 1. Add Loading Indicator at Bottom of List

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Update the loading indicator section** (around line 328):

```tsx
let loadingMorePostsComponent = null;
if (showLoadMore || (isFlaggedPosts && props.isGettingMoreFlaggedPosts)) {
    loadingMorePostsComponent = (
        <div className='loading-screen'>
            <div className='loading__content'>
                <div className='round round-1'/>
                <div className='round round-2'/>
                <div className='round round-3'/>
            </div>
        </div>
    );
}
```

#### 2. Prevent Multiple Simultaneous Requests

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Update scroll handler condition** (line 83):

```typescript
// Prevent scrolling if already loading more flagged posts
if (!props.isPinnedPosts &&
    !props.isSearchingTerm &&
    !props.isSearchGettingMore &&
    !props.isChannelFiles &&
    !props.isGettingMoreFlaggedPosts) { // Check flagged posts loading state

    // ... rest of scroll handler
}
```

#### 3. Add Error Handling UI

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Add error state display** (after loading indicator):

```tsx
let errorComponent = null;
if (isFlaggedPosts && props.flaggedPostsError) {
    errorComponent = (
        <div className='sidebar--right__error'>
            <i className='icon icon-alert-outline'/>
            <FormattedMessage
                id='search_results.flagged_posts_error'
                defaultMessage='Failed to load more saved messages. '
            />
            <button
                className='btn btn-link'
                onClick={() => props.getMoreFlaggedPosts()}
            >
                <FormattedMessage
                    id='search_results.retry'
                    defaultMessage='Retry'
                />
            </button>
        </div>
    );
}
```

#### 4. Add Error State to Redux

**File**: `webapp/packages/mattermost-redux/src/reducers/entities/search.ts`

**Add new reducer**:

```typescript
function flaggedPostsError(state: any = null, action: MMReduxAction) {
    switch (action.type) {
    case SearchTypes.GET_MORE_FLAGGED_POSTS_REQUEST:
    case SearchTypes.GET_MORE_FLAGGED_POSTS_SUCCESS:
        return null;
    case SearchTypes.GET_MORE_FLAGGED_POSTS_FAILURE:
        return action.error;
    case UserTypes.LOGOUT_SUCCESS:
        return null;
    default:
        return state;
    }
}
```

**Update export**:

```typescript
export default combineReducers({
    // ... existing reducers ...
    flaggedPostsError, // ADD THIS LINE
});
```

#### 5. Add Selector for Error State

**File**: `webapp/channels/src/selectors/rhs.ts`

**Add**:

```typescript
export function getFlaggedPostsError(state: GlobalState) {
    return state.entities.search.flaggedPostsError;
}
```

#### 6. Wire Up Error State in Component

**File**: `webapp/channels/src/components/search_results/index.tsx`

**Add to mapStateToProps**:

```typescript
flaggedPostsError: getFlaggedPostsError(state),
```

**File**: `webapp/channels/src/components/search_results/types.ts`

**Add to StateProps**:

```typescript
flaggedPostsError?: any;
```

#### 7. Add Loading Skeleton for Initial Load (Optional Enhancement)

**File**: `webapp/channels/src/components/search_results/search_results.tsx`

**Replace simple loading with skeleton** (around line 235):

```tsx
case isLoading:
    if (isFlaggedPosts) {
        contentItems = (
            <div className='sidebar--right__subheader a11y__section'>
                <div className='post-list__loading'>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className='post-skeleton'>
                            <div className='post-skeleton__avatar'/>
                            <div className='post-skeleton__content'>
                                <div className='post-skeleton__header'/>
                                <div className='post-skeleton__text'/>
                                <div className='post-skeleton__text post-skeleton__text--short'/>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    } else {
        contentItems = (
            <div className='sidebar--right__subheader a11y__section'>
                <div className='sidebar--right__loading'>
                    <LoadingWrapper text={loadingText}/>
                </div>
            </div>
        );
    }
```

#### 8. Add Skeleton Styles

**File**: `webapp/channels/src/sass/components/_loading.scss` (or create if doesn't exist)

**Add**:

```scss
.post-skeleton {
    display: flex;
    padding: 16px;
    animation: pulse 1.5s ease-in-out infinite;

    &__avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background-color: rgba(var(--center-channel-color-rgb), 0.08);
        margin-right: 12px;
        flex-shrink: 0;
    }

    &__content {
        flex: 1;
    }

    &__header {
        width: 120px;
        height: 12px;
        background-color: rgba(var(--center-channel-color-rgb), 0.08);
        border-radius: 4px;
        margin-bottom: 8px;
    }

    &__text {
        height: 10px;
        background-color: rgba(var(--center-channel-color-rgb), 0.08);
        border-radius: 4px;
        margin-bottom: 6px;

        &--short {
            width: 70%;
        }
    }
}

@keyframes pulse {
    0%, 100% {
        opacity: 1;
    }
    50% {
        opacity: 0.5;
    }
}
```

#### 9. Add i18n Strings

**File**: `webapp/channels/src/i18n/en.json`

**Add**:

```json
"search_results.flagged_posts_error": "Failed to load more saved messages.",
"search_results.retry": "Retry"
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd webapp && npm run check-types`
- [ ] SASS compilation passes: `cd webapp && npm run build`
- [ ] ESLint passes: `cd webapp && npm run check`
- [ ] Component tests pass
- [ ] No console errors during build

#### Manual Verification:
- [ ] Open Saved Posts - verify loading skeleton appears during initial load
- [ ] Scroll to bottom - verify animated dots loading indicator appears
- [ ] Verify loading indicator disappears when posts load
- [ ] Simulate network error (throttle in dev tools) - verify error message appears
- [ ] Click "Retry" button - verify it retries the request
- [ ] Verify loading indicator doesn't flicker or show unnecessarily
- [ ] Scroll rapidly - verify only one request is in flight at a time
- [ ] Verify smooth scrolling performance (no jank)
- [ ] Test on slow connection - verify good UX during loading
- [ ] Verify accessibility (screen reader announces loading states)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests

#### Redux Actions
- Test `getFlaggedPosts()` action dispatches correct action types
- Test `getMoreFlaggedPosts()` increments page number
- Test `getMoreFlaggedPosts()` doesn't fetch when `isFlaggedEnd` is true
- Test error handling in both actions
- Test total count is extracted from response correctly

#### Redux Reducers
- Test `flagged` reducer appends results when `isGettingMore` is true
- Test `flagged` reducer replaces results when `isGettingMore` is false
- Test `flagged` reducer handles preference changes correctly
- Test `flaggedPostsPagination` reducer updates state correctly
- Test `isGettingMoreFlaggedPosts` reducer toggles loading state
- Test total count increments/decrements when flagging/unflagging

#### Backend Unit Tests
- Test `getFlaggedPostsCount()` returns correct count
- Test count query handles channel filter correctly
- Test count query handles team filter correctly
- Test count respects channel membership
- Test API handler returns correct response structure
- Test backward compatibility (without `include_total_count`)

### Integration Tests

#### Frontend Integration
- Test clicking Saved Posts button loads first page
- Test scrolling to bottom triggers load more
- Test all posts are eventually loaded
- Test total count displays correctly
- Test flagging/unflagging updates UI and count
- Test error recovery flow

#### Backend Integration
- Test API endpoint with pagination parameters
- Test API endpoint with `include_total_count=true`
- Test filtering by channel while including count
- Test filtering by team while including count
- Test permissions (user can't see count for inaccessible channels)

### Manual Testing Scenarios

#### Happy Path
1. Create test account
2. Flag exactly 60 posts
3. Open Saved Posts - verify all 60 show, count shows "60 of 60"
4. Flag 41 more posts (total 101)
5. Refresh page, open Saved Posts
6. Verify shows "60 of 101"
7. Scroll to bottom
8. Verify loading indicator appears
9. Verify next 41 posts load
10. Verify count updates to "101 of 101"
11. Verify no more loading at bottom

#### Edge Cases
- 0 flagged posts - verify empty state
- 1 flagged post - verify no pagination
- Exactly 60 flagged posts - verify no "load more"
- 61 flagged posts - verify loads second page with 1 post
- 500+ flagged posts - verify performance is acceptable
- Flag/unflag during pagination - verify consistency
- Multiple tabs open - verify real-time updates work
- Slow network - verify loading states work well
- Network error during pagination - verify error handling

#### Cross-Browser Testing
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Android)

#### Accessibility Testing
- Keyboard navigation works
- Screen reader announces loading states
- Focus management during pagination
- ARIA labels are correct

### Performance Testing

#### Metrics to Monitor
- Time to first render (should be < 100ms)
- Scroll smoothness (60 FPS)
- API response time for count query (should be < 50ms with indexes)
- Memory usage with 1000+ posts loaded
- Network payload size

#### Load Testing
- Test with 10,000 flagged posts
- Test with 100 concurrent users
- Monitor database query performance
- Check for N+1 queries
- Verify indexes are being used

---

## Performance Considerations

### Frontend Performance
- **Debounced scroll handler**: 100ms debounce prevents excessive calls
- **Deduplication**: Use `Set` to remove duplicate post IDs when appending
- **Memoization**: Consider memoizing post list transformations
- **Virtual scrolling**: If users commonly have 500+ posts, implement react-window (future enhancement)

### Backend Performance
- **Database indexes**: Existing composite key index on Preferences is sufficient
- **COUNT query optimization**: Uses same indexes as main query
- **Query plan**: EXPLAIN ANALYZE the COUNT query to verify index usage
- **Caching consideration**: Count could be cached for 30 seconds if needed (future optimization)
- **Replica reads**: COUNT query runs on replica to reduce master load

### Network Performance
- **Payload size**: 60 posts per page is reasonable (~ 50KB compressed)
- **Request batching**: Don't fetch count on every pagination request
- **Compression**: Ensure gzip is enabled for JSON responses
- **ETags**: API supports ETags for caching

---

## Migration Notes

### Backward Compatibility
- ✅ API is backward compatible: `include_total_count` is optional
- ✅ Old clients will continue to work without total count
- ✅ New clients will work with old servers (gracefully degrade)
- ✅ No database migrations needed
- ✅ No breaking changes to Redux state shape

### Deployment Strategy
1. Deploy backend changes first (backward compatible)
2. Deploy frontend changes after backend is live
3. Monitor error rates and performance metrics
4. Rollback plan: revert frontend changes if issues arise (backend changes are safe to leave)

### Feature Flags (Optional)
Consider adding a feature flag for total count display:
- Allows gradual rollout
- Easy disable if performance issues arise
- Can be toggled per user or team

---

## References

### Original Issue
- Ticket: `TICKET.md` - Bug reproduction and expected behavior
- Research: `thoughts/shared/research/2025-11-11-flagged-posts-search-pagination.md` - Comprehensive analysis

### Related Code Patterns
- Search pagination: `webapp/packages/mattermost-redux/src/actions/search.ts:143-153`
- Infinite scroll: `webapp/channels/src/components/search_results/search_results.tsx:82-95`
- Total count pattern: `server/channels/api4/webhook.go:221-233`
- PostList model: `server/public/model/post_list.go`

### Backend References
- API handler: `server/channels/api4/post.go:349-430`
- App layer: `server/channels/app/post.go:1105-1133`
- Store interface: `server/channels/store/store.go:379-381`
- SQL implementation: `server/channels/store/sqlstore/post_store.go:491-555`

### Frontend References
- Redux actions: `webapp/packages/mattermost-redux/src/actions/search.ts:230-262`
- Redux reducers: `webapp/packages/mattermost-redux/src/reducers/entities/search.ts:82-142`
- Search results component: `webapp/channels/src/components/search_results/search_results.tsx`
- RHS actions: `webapp/channels/src/actions/views/rhs.ts:324-357`
- API client: `webapp/platform/client/src/client4.ts:2397-2402`

### Documentation
- Architecture guide: `CLAUDE.md`
- Contributing guidelines: `CONTRIBUTING.md`
- API documentation: https://api.mattermost.com

---

## Notes for Implementer

### Key Implementation Tips
1. **Follow the pattern exactly**: The search results pagination pattern works perfectly - replicate it
2. **Test incrementally**: Complete each phase fully before moving to the next
3. **Check TypeScript types**: Ensure all new Redux state is properly typed
4. **Run generators**: Don't forget `go generate` after adding store methods
5. **Test with real data**: Use a test account with 100+ flagged posts
6. **Monitor performance**: Keep an eye on COUNT query performance in production

### Common Pitfalls to Avoid
- ❌ Don't modify the `results` reducer - flagged posts use the `flagged` reducer
- ❌ Don't forget the `isGettingMore` flag - it's critical for append vs replace logic
- ❌ Don't skip the debounce on scroll handler - prevents request spam
- ❌ Don't fetch total count on every pagination request - only on initial load
- ❌ Don't forget to update total count when posts are flagged/unflagged in real-time

### Debugging Tips
- Use Redux DevTools to inspect state changes
- Add console.logs in scroll handler to verify it's being called
- Check Network tab to verify API parameters are correct
- Verify SQL query plan with EXPLAIN ANALYZE
- Test with React Profiler to check for unnecessary re-renders

---

**Total Estimated Effort**: 2-3 days for all three phases including testing

**Risk Level**: Low - following established patterns, backward compatible, well-researched
