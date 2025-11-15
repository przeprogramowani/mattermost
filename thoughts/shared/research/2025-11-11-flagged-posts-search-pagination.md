---
date: 2025-11-11T10:11:05+0000
researcher: Claude
git_commit: 45c3db2e2b80ec5e153d7c773ee10282af6fd4b1
branch: 10x-method
repository: mattermost
topic: "Flagged Posts - Search and Pagination UX Improvements"
tags: [research, codebase, flagged-posts, pagination, search, UX, bug]
status: complete
last_updated: 2025-11-11
last_updated_by: Claude
last_updated_note: "Added confirmed bug analysis from TICKET.md"
---

# Research: Flagged Posts - Search and Pagination UX Improvements

**Date**: 2025-11-11T10:11:05+0000
**Researcher**: Claude
**Git Commit**: 45c3db2e2b80ec5e153d7c773ee10282af6fd4b1
**Branch**: 10x-method
**Repository**: mattermost

## Research Question

How do flagged posts work in Mattermost, with the goal of introducing search and pagination to improve UX?

## Summary

Flagged posts in Mattermost (also called "Saved Messages") allow users to bookmark important messages for later reference. The current implementation has a **confirmed bug** where only 60 posts are displayed:

- **Backend**: Fully supports pagination via offset/limit parameters with filtering by team and channel
- **Frontend Bug**: Only loads first 60 posts, pagination explicitly disabled
- **Data Model**: Stores flags as user preferences in the `Preferences` table (not a dedicated table)
- **Performance**: Has proper database indexes but no caching of flagged posts lists

**Bug Confirmed (TICKET.md)**: When a user has 61+ flagged posts, only the **most recent 60** are displayed (sorted by CreateAt DESC). Older saved posts beyond the 60th are not accessible. The frontend makes only ONE API call with default parameters (60 posts max) and explicitly blocks infinite scroll for flagged posts.

## Detailed Findings

### 1. Data Model and Database Schema

#### Storage Architecture

Flagged posts **do not have a dedicated table**. Instead, they use the existing `Preferences` table with a special category.

**Database Schema** (`server/channels/db/migrations/postgres/000026_create_preferences.up.sql:1-10`):
```sql
CREATE TABLE IF NOT EXISTS preferences (
    userid varchar(26) NOT NULL,
    category varchar(32) NOT NULL,
    name varchar(32) NOT NULL,
    value varchar(2000),  -- Later changed to TEXT type
    PRIMARY KEY (userid, category, name)
);

CREATE INDEX IF NOT EXISTS idx_preferences_category ON preferences(category);
CREATE INDEX IF NOT EXISTS idx_preferences_name ON preferences(name);
```

**Model Definition** (`server/public/model/preference.go:121-126`):
```go
type Preference struct {
    UserId   string `json:"user_id"`
    Category string `json:"category"`
    Name     string `json:"name"`
    Value    string `json:"value"`
}
```

**Flagged Post Category Constant** (`server/public/model/preference.go:37`):
```go
PreferenceCategoryFlaggedPost = "flagged_post"
```

#### How Flagged Posts are Stored

For each flagged post:
- **UserId**: The user who flagged the post
- **Category**: `"flagged_post"` (constant)
- **Name**: The Post ID being flagged
- **Value**: Typically an empty string or metadata

#### Database Indexes

Performance optimization via:
1. **Composite Primary Key**: (userid, category, name)
2. **idx_preferences_category**: Speeds up filtering by `flagged_post` category
3. **idx_preferences_name**: Speeds up joining with Posts table on Post ID

### 2. Backend API Endpoints

#### REST API v4 Endpoint

**Route Definition** (`server/channels/api4/post.go:33`):
```go
api.BaseRoutes.PostsForUser.Handle("/flagged", api.APISessionRequired(getFlaggedPostsForUser))
```

**Endpoint**: `GET /api/v4/users/{user_id}/posts/flagged`

**Query Parameters** (`api/v4/source/posts.yaml:457-510`):
- `team_id` (optional) - Filter by team
- `channel_id` (optional) - Filter by channel
- `page` (default: 0) - Page number
- `per_page` (default: 60, max: 200) - Items per page

**Handler Implementation** (`server/channels/api4/post.go:349-430`):
```go
func getFlaggedPostsForUser(c *Context, w http.ResponseWriter, r *http.Request) {
    // Parse pagination params from query
    page := c.Params.Page       // Default: 0
    perPage := c.Params.PerPage // Default: 60, Max: 200

    // Parse filter params
    channelId := r.URL.Query().Get("channel_id")
    teamId := r.URL.Query().Get("team_id")

    // Call appropriate store method based on filters
    if channelId != "" {
        list = c.App.GetFlaggedPostsForChannel(userId, channelId, page*perPage, perPage)
    } else if teamId != "" {
        list = c.App.GetFlaggedPostsForTeam(userId, teamId, page*perPage, perPage)
    } else {
        list = c.App.GetFlaggedPosts(userId, page*perPage, perPage)
    }

    // Permission filtering happens in app layer
}
```

**Pagination Constants** (`server/channels/web/params.go:18-25`):
```go
PageDefault        = 0
PerPageDefault     = 60
PerPageMaximum     = 200
```

#### Actions API Endpoints

**Flag a Post** (`server/channels/api4/preference.go:90`):
- Method: `PUT /api/v4/users/{user_id}/preferences`
- Body: `[{category: "flagged_post", name: postId, value: "true"}]`
- Creates a preference to flag the post

**Unflag a Post** (`server/channels/api4/preference.go:90`):
- Method: `DELETE /api/v4/users/{user_id}/preferences`
- Body: `[{category: "flagged_post", name: postId}]`
- Removes the preference to unflag the post

### 3. Store Layer Implementation

#### Store Interface

**Interface Definition** (`server/channels/store/store.go:379-381`):
```go
GetFlaggedPosts(userID string, offset int, limit int) (*model.PostList, error)
GetFlaggedPostsForTeam(userID, teamID string, offset int, limit int) (*model.PostList, error)
GetFlaggedPostsForChannel(userID, channelID string, offset int, limit int) (*model.PostList, error)
```

#### SQL Implementation

**Core Implementation** (`server/channels/store/sqlstore/post_store.go:491-555`):
```go
func (s *SqlPostStore) getFlaggedPosts(userId, channelId, teamId string, offset int, limit int) (*model.PostList, error) {
    query := `
        SELECT A.*,
               (SELECT count(*) FROM Posts
                WHERE Posts.RootId = (CASE WHEN A.RootId = '' THEN A.Id ELSE A.RootId END)
                  AND Posts.DeleteAt = 0) as ReplyCount
        FROM (
            SELECT * FROM Posts
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
        ORDER BY A.CreateAt DESC
        LIMIT ? OFFSET ?
    `

    queryParams := []any{userId, model.PreferenceCategoryFlaggedPost}
    // ... additional params for filters and pagination
}
```

**Key Features**:
1. **Joins Preferences with Posts**: Subquery selects post IDs from preferences
2. **Calculates Reply Count**: For threading support
3. **Filters Deleted Posts**: WHERE DeleteAt = 0
4. **Validates Channel Membership**: Only returns posts from channels user can access
5. **Dynamic Filters**: Supports channel_id and team_id filtering
6. **Ordering**: ORDER BY CreateAt DESC (newest first)
7. **Pagination**: LIMIT ? OFFSET ?

#### Performance Layers

**Timer Layer** (`server/channels/store/timerlayer/timerlayer.go:6274-6321`):
- Wraps all three methods with timing metrics
- Tracks performance of flagged posts queries

**Retry Layer** (`server/channels/store/retrylayer/retrylayer.go:7855-7917`):
- Wraps all three methods with retry logic
- Provides reliability for database operations

**No Caching**: Flagged posts lists are NOT cached - every request hits the database

### 4. Business Logic Layer

**App Layer** (`server/channels/app/post.go:1105-1133`):

```go
func (a *App) GetFlaggedPosts(userId string, offset int, limit int) (*model.PostList, error) {
    // 1. Fetch from store
    posts, err := a.Srv().Store().Post().GetFlaggedPosts(userId, offset, limit)

    // 2. Filter inaccessible posts (security check)
    posts = a.filterInaccessiblePosts(posts, userId)

    // 3. Apply plugin hooks
    posts = a.applyPostsWillBeConsumedHook(posts)

    return posts, nil
}
```

**Security Filtering**: The app layer removes posts the user no longer has permission to view

### 5. Frontend Components and UI

#### Core Components

**Post Flag Icon** (`webapp/channels/src/components/post_view/post_flag_icon/post_flag_icon.tsx:1-114`):
- Toggle button on each post
- Shows filled icon when flagged, outline when not
- Tooltip: "Save Message" / "Remove from Saved"
- Actions: `flagPost(postId)` and `unflagPost(postId)`

**Saved Posts Button** (`webapp/channels/src/components/global_header/right_controls/saved_posts_button/saved_posts_button.tsx:1-54`):
- Bookmark icon in global header
- Opens RHS (Right Hand Sidebar) to show saved posts
- Dispatches `showFlaggedPosts()` action

**Search Results Component** (`webapp/channels/src/components/search_results/search_results.tsx:1-466`):
- Displays flagged posts when `isFlaggedPosts` prop is true
- Title: "Saved messages" (line 174)
- Shows all posts in chronological order
- Uses `PostSearchResultsItem` for individual posts

#### Current UX Pattern

**Access Points**:
1. Global header bookmark button → Opens RHS with all saved messages
2. Post menu flag icon → Save/unsave individual messages
3. Thread menu → Save/unsave options

**Display Pattern**:
- Opens in Right Hand Sidebar (RHS)
- Shows all flagged posts chronologically
- No grouping by channel, team, or date
- No search or filter UI
- Uses infinite scroll for loading

**No Results State**:
- Variant: `NoResultsVariant.FlaggedPosts`
- Shows instructions about using the "Save Message" button

### 6. Redux State Management

#### Actions

**Flag/Unflag Actions** (`webapp/channels/src/packages/mattermost-redux/src/actions/posts.ts`):
- `flagPost(postId)` (line 579-591): Saves preference
- `unflagPost(postId)` (line 1189+): Deletes preference

**Fetch Actions** (`webapp/channels/src/packages/mattermost-redux/src/actions/search.ts:230-262`):
```typescript
function getFlaggedPosts() {
    // Fetches ALL flagged posts for current user
    // No pagination parameters passed to API
    // Dispatches SEARCH_FLAGGED_POSTS_REQUEST/SUCCESS/FAILURE
}
```

**RHS Actions** (`webapp/channels/src/actions/views/rhs.ts:324-357`):
```typescript
function showFlaggedPosts() {
    // Updates RHS state to RHSStates.FLAG
    // Calls getFlaggedPosts() to load all posts
    // Displays in right sidebar
}
```

#### Selectors

**RHS Selectors** (`webapp/channels/src/selectors/rhs.ts:159-161`):
- `getIsSearchingFlaggedPost(state)`: Returns loading state

**Post Selectors** (`webapp/packages/mattermost-redux/src/selectors/entities/posts.ts:54`):
- `isPostFlagged(state, postId)`: Checks if specific post is flagged

#### API Client

**Client4 Method** (`webapp/platform/client/src/client4.ts:2397-2402`):
```typescript
getFlaggedPosts = (userId: string, channelId = '', teamId = '', page = 0, perPage = PER_PAGE_DEFAULT) => {
    return this.doFetch<PostList>(
        `${this.getUserRoute(userId)}/posts/flagged${buildQueryString({
            channel_id: channelId,
            team_id: teamId,
            page,
            per_page: perPage
        })}`,
        {method: 'get'},
    );
}
```

**Note**: The client supports pagination parameters, but current Redux actions don't use them!

### 7. Existing Pagination Patterns in Codebase

#### Backend Pagination Pattern

**Standard Pattern** (used throughout codebase):
1. Parse `page` and `per_page` from query params
2. Calculate `offset = page * perPage`
3. Pass `offset` and `limit` to store layer
4. Apply `LIMIT ? OFFSET ?` in SQL query
5. Validate max per_page (200)

**Example from Search** (`server/channels/api4/post.go:772-845`):
```go
func searchPosts(c *Context, w http.ResponseWriter, r *http.Request) {
    page := 0
    if params.Page != nil {
        page = *params.Page
    }
    perPage := 60
    if params.PerPage != nil {
        perPage = *params.PerPage
    }

    posts := c.App.SearchPostsForUser(terms, userId, teamId, isOrSearch,
                                       includeDeletedChannels, timeZoneOffset,
                                       page, perPage)
}
```

#### Frontend Pagination Patterns

**1. FooterPagination Component** (`webapp/platform/components/src/footer_pagination/footer_pagination.tsx:1-94`):
- Reusable prev/next pagination UI
- Props: `page`, `total`, `itemsPerPage`, `onNextPage`, `onPreviousPage`
- Shows "Showing X-Y of Z" count display
- Localized strings via react-intl
- Disabled states for buttons when at boundaries

**2. ListModal Component** (`webapp/channels/src/components/list_modal.tsx:1-269`):
- Full modal with built-in pagination
- Default: 50 items per page
- State management for page, items, totalCount, loading
- Page change handler with async data loading
- Search input with debouncing
- Pagination range calculation
- Conditional Previous/Next button rendering

**3. Infinite Scroll Pattern** (`webapp/channels/src/components/search_results/search_results.tsx:38-145`):
- Used for current search results
- `GET_MORE_BUFFER = 30` pixels before bottom
- Debounced scroll handler (100ms)
- Automatic second page fetch after initial load
- Flags to prevent loading: `isFlaggedPosts`, `isPinnedPosts`, `isSearchingTerm`
- **Current Issue**: Flagged posts explicitly DISABLE infinite scroll (line 83)

**Redux Pagination Pattern** (`webapp/packages/mattermost-redux/src/actions/search.ts:143-153`):
```typescript
function getMorePostsForSearch(teamId: string) {
    const {params, isEnd} = getState().entities.search.current[teamId];
    if (!isEnd) {
        const newParams = Object.assign({}, params);
        newParams.page += 1;  // Increment page counter
        return dispatch(searchPostsWithParams(teamId, newParams));
    }
}
```

## Code References

**Data Model**:
- `server/public/model/preference.go:37` - PreferenceCategoryFlaggedPost constant
- `server/public/model/preference.go:121-126` - Preference struct
- `server/channels/db/migrations/postgres/000026_create_preferences.up.sql:1-10` - Database schema

**Backend API**:
- `server/channels/api4/post.go:33` - Route definition
- `server/channels/api4/post.go:349-430` - Handler implementation
- `server/channels/web/params.go:18-25` - Pagination constants

**Store Layer**:
- `server/channels/store/store.go:379-381` - Interface definition
- `server/channels/store/sqlstore/post_store.go:491-555` - SQL implementation
- `server/channels/store/sqlstore/post_store.go:478-488` - Public methods

**App Layer**:
- `server/channels/app/post.go:1105-1133` - Business logic

**Frontend Components**:
- `webapp/channels/src/components/post_view/post_flag_icon/post_flag_icon.tsx:1-114` - Flag icon
- `webapp/channels/src/components/global_header/right_controls/saved_posts_button/saved_posts_button.tsx:1-54` - Header button
- `webapp/channels/src/components/search_results/search_results.tsx:1-466` - Results display

**Redux**:
- `webapp/packages/mattermost-redux/src/actions/posts.ts:579-591` - flagPost action
- `webapp/packages/mattermost-redux/src/actions/posts.ts:1189+` - unflagPost action
- `webapp/packages/mattermost-redux/src/actions/search.ts:230-262` - getFlaggedPosts action
- `webapp/channels/src/actions/views/rhs.ts:324-357` - showFlaggedPosts action

**API Client**:
- `webapp/platform/client/src/client4.ts:2397-2402` - getFlaggedPosts method

**Reusable Components**:
- `webapp/platform/components/src/footer_pagination/footer_pagination.tsx:1-94` - Pagination UI
- `webapp/channels/src/components/list_modal.tsx:1-269` - Modal with pagination

## Architecture Insights

### Current Implementation Strengths

1. **Backend Fully Supports Pagination**: All necessary infrastructure exists
2. **Flexible Filtering**: Can filter by team_id and channel_id
3. **Performance Optimized**: Proper database indexes on composite key and lookup columns
4. **Security Built-In**: App layer filters inaccessible posts
5. **Modular Store Layer**: Interface pattern allows for easy enhancement
6. **Plugin Integration**: Plugin hooks allow extensions

### Current Implementation Gaps

1. **Frontend Doesn't Use Pagination**: Redux actions fetch ALL flagged posts at once
2. **No Search/Filter UI**: Users can't search within saved messages
3. **No Caching**: Every flagged posts request hits the database
4. **No Total Count**: API doesn't return total count of flagged posts
5. **Infinite Scroll Disabled**: Explicitly disabled for flagged posts (search_results.tsx:83)
6. **No Categorization**: Posts not grouped by channel, team, or date range
7. **No Sort Options**: Only chronological descending order

### Design Patterns Used

1. **Preferences for Lightweight Bookmarking**: Clever use of existing table
2. **Store Interface Pattern**: Clean separation of data access
3. **Layer Architecture**: API → App → Store with clear responsibilities
4. **Plugin Hook System**: Extensibility built-in
5. **Right Hand Sidebar Pattern**: Consistent with other features (pins, mentions)

## Confirmed Bug Analysis (TICKET.md)

### Bug Description

**Reported Issue**: When a user saves 61 or more posts, only the **most recent 60** are displayed in the Saved Posts panel. Older saved posts (61+) are not visible, even when scrolling.

**Expected Behavior**: All saved posts should be visible as the user scrolls through them.

**Sort Order Confirmed**: The backend query uses `ORDER BY CreateAt DESC` (`server/channels/store/sqlstore/post_store.go:529`), meaning posts are sorted by creation date in **descending order** (newest first). With LIMIT 60 and OFFSET 0, users see their 60 most recently saved posts, but cannot access older ones.

### Root Cause Analysis

The bug exists due to three specific implementation issues in the frontend:

#### 1. Redux Action Only Fetches First Page

**File**: `webapp/channels/src/packages/mattermost-redux/src/actions/search.ts:239`

```typescript
posts = await Client4.getFlaggedPosts(userId);
```

The `getFlaggedPosts()` action calls the API client with ONLY the `userId` parameter, omitting pagination parameters. The Client4 method signature is:

```typescript
getFlaggedPosts(userId: string, channelId = '', teamId = '', page = 0, perPage = PER_PAGE_DEFAULT)
```

When called with just `userId`, it defaults to:
- `page = 0` (first page only)
- `perPage = PER_PAGE_DEFAULT` (60 posts)

**Result**: Only the first 60 posts are ever fetched.

#### 2. Infinite Scroll Explicitly Disabled

**File**: `webapp/channels/src/components/search_results/search_results.tsx:83`

```typescript
if (!props.isFlaggedPosts && !props.isPinnedPosts && !props.isSearchingTerm && !props.isSearchGettingMore && !props.isChannelFiles) {
    const scrollHeight = scrollbars.current?.scrollHeight || 0;
    const scrollTop = scrollbars.current?.scrollTop || 0;
    const clientHeight = scrollbars.current?.clientHeight || 0;
    if ((scrollTop + clientHeight + GET_MORE_BUFFER) >= scrollHeight) {
        if (searchType === DataSearchTypes.FILES_SEARCH_TYPE) {
            loadMoreFiles();
        } else {
            loadMorePosts();
        }
    }
}
```

The scroll handler checks `!props.isFlaggedPosts`, which means **when viewing flagged posts, the entire scroll handler is skipped**. This prevents:
- Detection of scroll to bottom
- Calling `loadMorePosts()` function
- Loading additional pages

#### 3. Load More Indicator Hidden

**File**: `webapp/channels/src/components/search_results/search_results.tsx:145`

```typescript
const showLoadMore = !isAtEnd && !isChannelFiles && !isFlaggedPosts && !isPinnedPosts;
```

The loading indicator is explicitly hidden for flagged posts (`!isFlaggedPosts`), so users don't see any visual feedback that more posts could be loaded.

#### 4. No "Get More" Action for Flagged Posts

Unlike search results which have `getMorePostsForSearch()` action (`webapp/packages/mattermost-redux/src/actions/search.ts:143-153`), there is **no equivalent `getMoreFlaggedPosts()` action**.

The search pattern that works correctly:
```typescript
export function getMorePostsForSearch(teamId: string): ActionFuncAsync {
    return async (dispatch, getState) => {
        const {params, isEnd} = getState().entities.search.current[teamId || 'ALL_TEAMS'];
        if (!isEnd) {
            const newParams = Object.assign({}, params);
            newParams.page += 1;  // Increment page counter
            return dispatch(searchPostsWithParams(teamId, newParams));
        }
        return {data: true};
    };
}
```

This pattern does not exist for flagged posts.

### Why Backend Is Not The Problem

The backend **fully supports pagination**:

- API endpoint: `GET /api/v4/users/{user_id}/posts/flagged` accepts `page` and `per_page` parameters
- Store layer methods accept `offset` and `limit` parameters
- SQL queries properly implement `LIMIT ? OFFSET ?`
- Maximum per_page is 200, default is 60

The backend is ready - the frontend just doesn't use it.

### Suggested Fix (from TICKET.md)

The ticket recommends:

1. Implement a "load more" function in `search_results.tsx`
2. Trigger it when the user scrolls to the bottom
3. Check if the next page of results is non-zero
4. If results are zero, stop calling load more
5. This ensures all saved posts are displayed beyond the 60-item limit

### Code Changes Required

**Minimal fix to enable infinite scroll**:

1. **Create `getMoreFlaggedPosts()` action** (similar to `getMorePostsForSearch`)
2. **Track pagination state** in Redux (page number, isAtEnd flag)
3. **Remove `!props.isFlaggedPosts` from line 83** in search_results.tsx
4. **Remove `!isFlaggedPosts` from line 145** in search_results.tsx
5. **Wire up the action** to props in the component container

**Estimated effort**: 2-4 hours for minimal working fix.

## UX Improvement Opportunities

### Search Functionality

**Recommended Approach**:
1. Add search input in RHS header for flagged posts
2. Implement client-side filtering initially (search within loaded posts)
3. For server-side search, leverage existing search infrastructure:
   - Use `searchPostsWithParams` with additional filter for flagged posts
   - Backend already has full-text search capabilities

**Reference Implementation**: Search posts component pattern (search_results.tsx)

### Pagination Improvements

**Recommended Approach**:
1. **Enable Infinite Scroll**: Remove the `isFlaggedPosts` flag blocking infinite scroll
2. **Implement Load More**: Use the `getMorePostsForSearch` pattern
3. **Add Total Count**: Modify backend to return total count in response
4. **Page Size Options**: Allow users to configure items per page

**Reference Components**:
- FooterPagination component for simple prev/next UI
- ListModal component for full-featured modal with pagination
- Search results infinite scroll pattern

### Filtering and Categorization

**Recommended Features**:
1. **Filter by Channel**: Use existing `channel_id` query parameter
2. **Filter by Team**: Use existing `team_id` query parameter
3. **Filter by Date Range**: Add date range filters
4. **Group by Channel**: Visual grouping in UI
5. **Sort Options**: Allow sorting by date, channel, relevance

**Implementation Strategy**:
- Backend already supports channel and team filtering
- Add UI dropdowns/filters in RHS header
- Update Redux actions to pass filter parameters

### Performance Enhancements

**Recommended Optimizations**:
1. **Add Caching Layer**: Cache flagged posts list for short duration (5 minutes)
2. **Implement Virtual Scrolling**: For users with hundreds of saved messages
3. **Lazy Load Attachments**: Load images/files on demand
4. **Prefetch Next Page**: When scrolling, prefetch upcoming page

### Better UX Patterns

**Recommended Enhancements**:
1. **Quick Actions**: Unflag, share, copy link from list view
2. **Bulk Actions**: Select multiple posts to unflag
3. **Keyboard Navigation**: Arrow keys to navigate, 'U' to unflag
4. **Export Functionality**: Export saved messages as PDF/CSV
5. **Collections/Tags**: Allow users to organize saved messages into collections

## Related Research

No previous research documents found for flagged posts functionality.

## Open Questions

1. **Total Count Performance**: What's the performance impact of adding COUNT query for total flagged posts?
2. **Caching Strategy**: Should flagged posts be cached? What's the invalidation strategy?
3. **Search Backend**: Should search use Elasticsearch integration or SQL LIKE queries?
4. **Migration Path**: How to handle users with thousands of existing flagged posts?
5. **Mobile Parity**: Do mobile apps need the same pagination/search features?
6. **Plugin Impact**: Do any plugins rely on current flagged posts behavior?

## Recommendations Summary

### Short-term Quick Wins

1. **Enable Infinite Scroll**: Remove the flag blocking load more for flagged posts (~1 hour)
2. **Client-Side Search**: Add search input with client-side filtering (~4 hours)
3. **Filter by Channel**: Add dropdown to filter by channel using existing API (~8 hours)

### Medium-term Improvements

1. **Server-Side Search**: Integrate with search infrastructure (~3 days)
2. **Pagination UI**: Add FooterPagination component option (~2 days)
3. **Total Count**: Modify backend to return total count (~1 day)
4. **Grouping by Channel**: Visual grouping in UI (~3 days)

### Long-term Enhancements

1. **Virtual Scrolling**: For performance with large lists (~1 week)
2. **Collections/Tags**: User-defined categorization (~2 weeks)
3. **Bulk Actions**: Multi-select and bulk operations (~1 week)
4. **Export Functionality**: Export saved messages (~1 week)
5. **Caching Layer**: Add Redis/in-memory cache (~1 week)

### Backend Changes Required

**Minimal Changes for Pagination**:
- Backend already supports pagination - no changes needed!

**For Total Count**:
- Add COUNT query in store layer
- Include total in PostList response
- Update API specification

**For Search**:
- Option 1: Leverage existing search infrastructure with flagged_post filter
- Option 2: Add LIKE query to flagged posts store methods

### Frontend Changes Required

**For Basic Pagination**:
1. Update `getFlaggedPosts` action to accept page/perPage parameters
2. Remove `isFlaggedPosts` from infinite scroll disable flags
3. Implement `getMoreFlaggedPosts` action similar to search
4. Add loading indicator for pagination

**For Search**:
1. Add search input component to RHS header
2. Add local state for search term
3. Implement client-side filtering initially
4. Later: call search API with flagged_post filter

**For Filters**:
1. Add filter dropdowns (channel, team, date range)
2. Update Redux state for active filters
3. Pass filters to API client
4. Update URL query params for bookmarkability
