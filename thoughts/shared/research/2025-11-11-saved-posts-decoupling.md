---
date: 2025-11-11T16:00:35+0000
researcher: Claude
git_commit: ccdfcc71f4ab74b89d1fc16eab95e3619bfafb56
branch: 10x-method
repository: mattermost
topic: "UI Component Coupling in Search, Pinned Posts, and Flagged Posts"
tags: [research, codebase, search, pinned-posts, flagged-posts, decoupling, react, redux]
status: complete
last_updated: 2025-11-11
last_updated_by: Claude
---

# Research: UI Component Coupling in Search, Pinned Posts, and Flagged Posts

**Date**: 2025-11-11T16:00:35+0000
**Researcher**: Claude
**Git Commit**: ccdfcc71f4ab74b89d1fc16eab95e3619bfafb56
**Branch**: 10x-method
**Repository**: mattermost

## Research Question

Research coupling of UI components in three contexts - search, pinned posts, and flagged posts. The research should help decouple flagged posts from others, as separate components with a common "search core" (but absolutely no ifs and conditionals).

## Summary

The current implementation uses a **single monolithic component** (`SearchResults`) that handles all three features (search, pinned posts, flagged posts) through **extensive conditional logic**. This component contains **20+ conditional branches** checking `isFlaggedPosts`, `isPinnedPosts`, `isMentionSearch`, `isChannelFiles`, and `isCard` flags.

**Key Finding**: While the three features share common patterns (post list rendering, pagination, loading states), they are currently **tightly coupled** in a single component with conditional rendering throughout. A "search core" abstraction would need to:

1. Extract the **common list rendering pattern** (virtualized list, scroll-based pagination, post items, loading/empty states)
2. Create **separate container components** for each feature that provide data and configuration
3. Remove all conditionals from the core component

## Detailed Findings

### Current Coupling Points

#### 1. SearchResults Component - The Main Coupling Point

**File**: `webapp/channels/src/components/search_results/search_results.tsx` (477 lines)

This single component handles ALL THREE features using conditional flags:

**Conditional Props**:
```typescript
{
  isFlaggedPosts: boolean;
  isPinnedPosts: boolean;
  isMentionSearch: boolean;
  isChannelFiles: boolean;
  isCard: boolean;
}
```

**Conditionals Throughout the Component**:

- **Line 68**: `useEffect` watches `isFlaggedPosts`, `isPinnedPosts`, `isMentionSearch`
- **Line 83**: Scroll handler: `if (!props.isPinnedPosts && ...)`
- **Line 90**: Pagination: `if (props.isFlaggedPosts) { loadMoreFlaggedPosts() }`
- **Line 155**: End detection: `(isFlaggedPosts && props.isFlaggedAtEnd)`
- **Line 156**: Show load more: `!isAtEnd && !isChannelFiles && !isPinnedPosts`
- **Line 157**: Messages search detection: `(!isFlaggedPosts && !isMentionSearch && !isCard && !isPinnedPosts && !isChannelFiles)`
- **Lines 169-236**: Large if/else chain determining title and empty state variant
- **Line 255**: Empty state condition checking all flags
- **Line 321**: Passing flags to child: `isFlaggedPosts={props.isFlaggedPosts}`
- **Line 339**: Loading more: `(isFlaggedPosts && props.isGettingMoreFlaggedPosts && !props.isFlaggedAtEnd)`
- **Line 361**: Tab selector: `{isMessagesSearch && <MessageOrFileSelector />}`

**Different Pagination Behaviors**:
```typescript
// Line 82-96
if ((scrollTop + clientHeight + GET_MORE_BUFFER) >= scrollHeight) {
  if (searchType === DataSearchTypes.FILES_SEARCH_TYPE) {
    loadMoreFiles();
  } else if (props.isFlaggedPosts) {
    loadMoreFlaggedPosts();  // Different action for flagged
  } else {
    loadMorePosts();         // Different action for search
  }
}
```

**Different Loading States**:
```typescript
// Line 154
const isLoading = isSearchingTerm || isSearchingFlaggedPost || isSearchingPinnedPost || !isOpened;
```

**Different Empty States**:
```typescript
// Lines 169-236
if (isMentionSearch) {
  noResultsProps.variant = NoResultsVariant.Mentions;
  titleDescriptor = 'Recent Mentions';
} else if (isFlaggedPosts) {
  noResultsProps.variant = NoResultsVariant.FlaggedPosts;
  titleDescriptor = 'Saved messages';
} else if (isPinnedPosts) {
  noResultsProps.variant = NoResultsVariant.PinnedPosts;
  titleDescriptor = 'Pinned messages';
}
// ... more conditionals
```

#### 2. PostSearchResultsItem - Passes Context Flags

**File**: `webapp/channels/src/components/search_results/post_search_results_item.tsx` (39 lines)

```typescript
<PostSearchResultsItem
  post={post}
  matches={props.matches[post.id] || []}
  searchTerm={searchTerms}
  isFlaggedPosts={props.isFlaggedPosts}      // Flag passed through
  isMentionSearch={props.isMentionSearch}    // Flag passed through
  isPinnedPosts={props.isPinnedPosts}        // Flag passed through
/>
```

#### 3. PostComponent - Conditional Styling

**File**: `webapp/channels/src/components/post/post_component.tsx`

- Props include `isFlagged` and `isFlaggedPosts` booleans
- Applies CSS class `post--pinned-or-flagged` conditionally
- Uses `isFlaggedPosts` to determine search result context

#### 4. Redux Actions - Coupled RHS Updates

**File**: `webapp/channels/src/actions/post_actions.ts`

```typescript
// Flag action checks RHS state and updates search results
export function flagPost(postId: string): ActionFuncAsync {
  return async (dispatch, getState) => {
    await dispatch(PostActions.flagPost(postId));
    const state = getState();
    const rhsState = getRhsState(state);
    if (rhsState === RHSStates.FLAG) {  // Conditional based on RHS state
      dispatch(addPostToSearchResults(postId));
    }
    return {data: true};
  };
}

// Unflag action also checks RHS state
export function unflagPost(postId: string): ActionFuncAsync {
  return async (dispatch, getState) => {
    await dispatch(PostActions.unflagPost(postId));
    const state = getState();
    const rhsState = getRhsState(state);
    if (rhsState === RHSStates.FLAG) {  // Conditional based on RHS state
      removePostFromSearchResults(postId, state, dispatch);
    }
    return {data: true};
  };
}
```

#### 5. DotMenu - Conditional Pin/Unpin UI

**File**: `webapp/channels/src/components/dot_menu/dot_menu.tsx`

- Shows "Pin" or "Unpin" based on `post.is_pinned` status
- Conditionally renders flag/unflag options
- Checks `canFlagContent` based on team settings

### Common Patterns (The "Search Core")

Despite the tight coupling, all three features share these patterns:

#### 1. **List Rendering Pattern**

All three use the same structure:
- Array of post IDs or Post objects
- Map over results rendering individual items
- Date separators for chronological grouping
- Empty state when no results
- Loading state during fetch

#### 2. **Scroll-Based Pagination**

```typescript
const GET_MORE_BUFFER = 30;  // 30px from bottom triggers load

const handleScroll = (): void => {
  const scrollHeight = scrollbars.current?.scrollHeight || 0;
  const scrollTop = scrollbars.current?.scrollTop || 0;
  const clientHeight = scrollbars.current?.clientHeight || 0;

  if ((scrollTop + clientHeight + GET_MORE_BUFFER) >= scrollHeight) {
    loadMore();  // Feature-specific load action
  }
};
```

Shared pattern:
- 30px buffer before bottom
- Debounced handler (100ms)
- Loading state prevents duplicate requests
- "At end" flag stops further loading

#### 3. **Post Item Rendering**

All use `PostSearchResultsItem` which wraps `PostComponent`:
```typescript
<PostSearchResultsItem
  key={post.id}
  post={post}
  matches={props.matches[post.id] || []}
  searchTerm={searchTerms}
  a11yIndex={index}
/>
```

#### 4. **Loading States**

All features use similar loading indicators:
```typescript
<LoadingWrapper text="Searching" />

// Or for "load more":
<div className='loading-screen'>
  <div className='loading__content'>
    <div className='round round-1'/>
    <div className='round round-2'/>
    <div className='round round-3'/>
  </div>
</div>
```

#### 5. **Empty States**

All use `NoResultsIndicator` with different variants:
- `NoResultsVariant.FlaggedPosts`
- `NoResultsVariant.PinnedPosts`
- `NoResultsVariant.ChannelSearch`
- `NoResultsVariant.Mentions`

### Feature-Specific Implementations

#### Search Feature

**Components**:
- `webapp/channels/src/components/new_search/new_search.tsx` - Modern search UI
- `webapp/channels/src/components/new_search/search_box.tsx` - Input with suggestions
- `webapp/channels/src/components/search_results/search_results.tsx` - Results display

**Unique Characteristics**:
- Search input with suggestions
- Messages/Files tab switching
- Cross-team search support
- Search term highlighting in results
- Advanced search syntax (date filters, channel filters, user filters)
- File extension suggestions

**Redux Actions**:
- `searchPosts(terms, isMentionSearch)` - API call to `/api/v4/posts/search`
- `updateSearchTerms(terms)`
- `getMorePostsForSearch()`

**State**:
```typescript
state.entities.search = {
  results: string[];           // Post IDs
  fileResults: FileSearchResultItem[];
  matches: {[postId: string]: string[]};
  isSearchingTerm: boolean;
  isSearchGettingMore: boolean;
  isSearchAtEnd: boolean;
}
```

#### Pinned Posts Feature

**Components**:
- `webapp/channels/src/components/channel_header_menu/menu_items/view_pinned_posts.tsx` - Menu trigger
- `webapp/channels/src/components/post_view/post_pre_header/post_pre_header.tsx` - Pin badge display
- `webapp/channels/src/components/dot_menu/dot_menu.tsx` - Pin/unpin actions
- `webapp/channels/src/components/search_results/search_results.tsx` - Results display (shared)

**Unique Characteristics**:
- No search input (just displays list)
- No pagination (all pins loaded at once)
- Pin/unpin toggle in post menu
- Pin badge shown on posts in main view
- Channel-specific (not cross-channel)

**Redux Actions**:
- `showPinnedPosts()` - Loads via `getPinnedPosts(channelId)` → `/api/v4/channels/{id}/pinned`
- `pinPost(postId)` - API call to `/api/v4/posts/{id}/pin`
- `unpinPost(postId)` - API call to `/api/v4/posts/{id}/unpin`

**State**:
```typescript
// Uses same search.results array
state.entities.search = {
  results: string[];              // Post IDs (pinned posts)
  isSearchingPinnedPost: boolean;
}

// Post metadata
state.entities.posts.posts[postId].is_pinned = true;

// Channel pinned count
state.entities.channels.channels[channelId].pinned_posts_count = number;
```

#### Flagged Posts Feature

**Components**:
- `webapp/channels/src/components/flag_message_modal/flag_post_modal.tsx` - Flag submission modal
- `webapp/channels/src/components/post_view/post_flag_icon/post_flag_icon.tsx` - Flag/unflag button
- `webapp/channels/src/components/search_results/search_results.tsx` - Results display (shared)
- `webapp/channels/src/components/remove_flagged_message_confirmation_modal/` - Reviewer modal

**Unique Characteristics**:
- No search input (just displays list)
- **Pagination required** (unlike pinned posts)
- Flag/unflag toggle in post menu
- Content flagging workflow (reporting + reviewer actions)
- Cross-channel (shows all flagged posts)
- Optional flag reasons and comments

**Redux Actions**:
- `showFlaggedPosts()` - Loads via `getFlaggedPosts()` → `/api/v4/users/{userId}/posts/flagged`
- `getMoreFlaggedPosts()` - Paginated fetch → `/api/v4/users/{userId}/posts/flagged?page={page}`
- `flagPost(postId)` - API call to `/api/v4/posts/{id}/flag`
- `unflagPost(postId)` - API call to `/api/v4/posts/{id}/unflag`

**State**:
```typescript
state.entities.search = {
  results: string[];                    // Post IDs (flagged posts)
  isSearchingFlaggedPost: boolean;
  isGettingMoreFlaggedPosts: boolean;
  isFlaggedAtEnd: boolean;
}

// Post metadata
state.entities.posts.posts[postId].is_flagged = true;

// Content flagging config
state.entities.contentFlagging = {
  config: ContentFlaggingConfig;
  fields: ContentFlaggingField[];
  values: {[postId: string]: ContentFlaggingValues};
}
```

### Redux State Architecture

All three features share the **same Redux state slice** (`state.entities.search`):

```typescript
// webapp/platform/packages/mattermost-redux/src/reducers/entities/search.ts

type SearchState = {
  // Common fields
  results: string[];                    // Post IDs (search OR pinned OR flagged)
  fileResults: FileSearchResultItem[];  // File search results
  matches: {[postId: string]: string[]}; // Search term matches for highlighting

  // Feature-specific loading states
  isSearchingTerm: boolean;             // Search loading
  isSearchingPinnedPost: boolean;       // Pinned loading
  isSearchingFlaggedPost: boolean;      // Flagged loading

  // Feature-specific pagination states
  isSearchGettingMore: boolean;         // Search pagination loading
  isGettingMoreFlaggedPosts: boolean;   // Flagged pagination loading

  // Feature-specific end-of-list states
  isSearchAtEnd: boolean;               // Search reached end
  isSearchFilesAtEnd: boolean;          // File search reached end
  isFlaggedAtEnd: boolean;              // Flagged reached end

  // Search-specific state
  searchTerms: string;                  // Current search query
  searchType: string;                   // 'messages' or 'files'
  searchFilterType: string;             // File type filter
};
```

**Design Pattern**: Single reducer, multiple features, distinguished by loading flags.

### Shared Utilities

**File**: `webapp/channels/src/utils/post_utils.ts`

Common post utilities used by all features:
- `isSystemMessage(post)` - Check if post is system message
- `isComment(post)` - Check if post is a reply
- `isEdited(post)` - Check if post was edited
- `canDeletePost(post, currentUserId)` - Permission check
- `canEditPost(post, currentUserId)` - Permission check
- `usePostAriaLabel(post)` - Accessibility label
- `createAriaLabelForPost(post)` - Generate ARIA label

**File**: `webapp/channels/src/components/dynamic_virtualized_list/`

Generic virtualized list component used for performance:
- Renders only visible items
- 80px overscan buffer
- Scroll position tracking
- Dynamic item height calculation

## Architecture Insights

### Current Architecture Issues

1. **God Component Anti-Pattern**: `SearchResults` has grown to 477 lines handling too many responsibilities
2. **High Cyclomatic Complexity**: 20+ conditional branches make it hard to test and maintain
3. **Tight Coupling**: Changes to one feature (e.g., flagged posts) risk breaking others
4. **Props Proliferation**: Component accepts 30+ props with many feature-specific flags
5. **Difficult Testing**: Must mock all features even when testing one
6. **Hard to Extend**: Adding a new similar feature requires more conditionals

### Proposed Decoupling Strategy

#### Core Abstraction: PostListCore Component

Create a **pure, stateless** list component with **zero conditionals**:

```typescript
interface PostListCoreProps {
  // Data
  items: Array<Post | string>;  // Posts or date separators

  // Rendering
  renderItem: (item: Post, index: number) => React.ReactNode;
  renderDateSeparator: (date: Date) => React.ReactNode;
  renderEmpty: () => React.ReactNode;
  renderLoading: () => React.ReactNode;

  // State
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;

  // Actions
  onLoadMore: () => void;

  // Configuration
  loadMoreBuffer?: number;  // Default 30px
  debounceMs?: number;      // Default 100ms

  // Accessibility
  ariaLabel: string;
  a11yRegionId: string;
}
```

**Key Principles**:
- **No conditionals** - All behavior injected via props
- **Render props pattern** - Parent controls rendering
- **Single responsibility** - Only handles list rendering and scroll pagination
- **Composable** - Can be wrapped by any feature-specific container

#### Feature-Specific Containers

##### 1. FlaggedPostsContainer

```typescript
const FlaggedPostsContainer: React.FC = () => {
  const dispatch = useDispatch();
  const posts = useSelector(getFlaggedPosts);
  const isLoading = useSelector(isLoadingFlaggedPosts);
  const isLoadingMore = useSelector(isLoadingMoreFlaggedPosts);
  const hasMore = useSelector(!isFlaggedAtEnd);

  useEffect(() => {
    dispatch(showFlaggedPosts());
  }, []);

  const handleLoadMore = () => {
    dispatch(getMoreFlaggedPosts());
  };

  return (
    <RHSPanel
      title="Saved Messages"
      headerActions={<CloseButton />}
    >
      <PostListCore
        items={posts}
        renderItem={(post, index) => (
          <FlaggedPostItem post={post} a11yIndex={index} />
        )}
        renderEmpty={() => (
          <EmptyState
            icon={<SavedMessagesIcon />}
            title="No saved messages yet"
            subtitle="Click Save Message to add messages here"
          />
        )}
        renderLoading={() => <LoadingSpinner text="Loading..." />}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        ariaLabel="Saved messages list"
        a11yRegionId="flagged-posts-panel"
      />
    </RHSPanel>
  );
};
```

##### 2. PinnedPostsContainer

```typescript
const PinnedPostsContainer: React.FC = () => {
  const dispatch = useDispatch();
  const channelId = useSelector(getCurrentChannelId);
  const posts = useSelector(getPinnedPostsForChannel);
  const isLoading = useSelector(isLoadingPinnedPosts);

  useEffect(() => {
    dispatch(showPinnedPosts(channelId));
  }, [channelId]);

  return (
    <RHSPanel
      title="Pinned Messages"
      headerActions={<CloseButton />}
    >
      <PostListCore
        items={posts}
        renderItem={(post, index) => (
          <PinnedPostItem post={post} a11yIndex={index} />
        )}
        renderEmpty={() => (
          <EmptyState
            icon={<PinIcon />}
            title="No pinned messages"
            subtitle="Pin important messages to find them easily"
          />
        )}
        renderLoading={() => <LoadingSpinner text="Loading..." />}
        isLoading={isLoading}
        isLoadingMore={false}
        hasMore={false}  // No pagination for pinned posts
        onLoadMore={() => {}}
        ariaLabel="Pinned messages list"
        a11yRegionId="pinned-posts-panel"
      />
    </RHSPanel>
  );
};
```

##### 3. SearchResultsContainer

```typescript
const SearchResultsContainer: React.FC = () => {
  const dispatch = useDispatch();
  const searchTerms = useSelector(getSearchTerms);
  const posts = useSelector(getSearchResults);
  const matches = useSelector(getSearchMatches);
  const isLoading = useSelector(isSearchingTerm);
  const isLoadingMore = useSelector(isSearchGettingMore);
  const hasMore = useSelector(!isSearchAtEnd);

  const handleLoadMore = () => {
    dispatch(getMorePostsForSearch());
  };

  return (
    <RHSPanel
      title="Search Results"
      headerActions={
        <>
          <MessageFileToggle />
          <CloseButton />
        </>
      }
    >
      <SearchInput />
      <PostListCore
        items={posts}
        renderItem={(post, index) => (
          <SearchResultItem
            post={post}
            matches={matches[post.id]}
            searchTerm={searchTerms}
            a11yIndex={index}
          />
        )}
        renderEmpty={() => (
          <EmptyState
            icon={<SearchIcon />}
            title={`No results for "${searchTerms}"`}
            subtitle="Try different keywords or filters"
          />
        )}
        renderLoading={() => <LoadingSpinner text="Searching..." />}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        ariaLabel="Search results list"
        a11yRegionId="search-results-panel"
      />
    </RHSPanel>
  );
};
```

#### Benefits of This Architecture

1. **Zero Conditionals in Core**: `PostListCore` has no if statements, just pure rendering logic
2. **Single Responsibility**: Each container handles only its feature
3. **Easy Testing**: Test core independently, test containers with mocked data
4. **Easy Extension**: Add new features by creating new containers, no changes to core
5. **Type Safety**: Each container provides exact types needed
6. **Better Performance**: Core can be heavily optimized without feature-specific code
7. **Clear Ownership**: Each feature team can own their container

#### Migration Path

**Phase 1**: Extract PostListCore
1. Create `PostListCore` component with render props
2. Keep existing `SearchResults` component
3. No functionality changes, just internal refactor

**Phase 2**: Create Containers
1. Create `FlaggedPostsContainer` using `PostListCore`
2. Update RHS routing to use new container
3. Test thoroughly with existing behavior

**Phase 3**: Migrate Remaining Features
1. Create `PinnedPostsContainer`
2. Create `SearchResultsContainer`
3. Update RHS routing

**Phase 4**: Remove Old Component
1. Delete `SearchResults` component
2. Clean up conditional props from related components
3. Remove feature flags from Redux actions

### Alternative Approach: Separate Redux Slices

Instead of sharing `state.entities.search`, create separate slices:

```typescript
state.entities.searchResults = { ... }
state.entities.flaggedPosts = { ... }
state.entities.pinnedPosts = { ... }
```

**Pros**:
- Clearer data ownership
- No shared loading state confusion
- Easier to reason about state updates

**Cons**:
- Slight Redux boilerplate increase
- Need to update selectors
- Migration requires more Redux changes

**Recommendation**: Keep shared Redux slice for now, focus on UI decoupling first.

## Code References

### Main Coupling Points
- `webapp/channels/src/components/search_results/search_results.tsx:68` - Feature flag effects
- `webapp/channels/src/components/search_results/search_results.tsx:83` - Conditional scroll handling
- `webapp/channels/src/components/search_results/search_results.tsx:90` - Conditional pagination
- `webapp/channels/src/components/search_results/search_results.tsx:155` - Conditional end detection
- `webapp/channels/src/components/search_results/search_results.tsx:169-236` - Title/empty state conditionals
- `webapp/channels/src/components/search_results/search_results.tsx:321` - Flag props propagation
- `webapp/channels/src/components/search_results/search_results.tsx:361` - Conditional tab display

### Redux State Management
- `webapp/platform/packages/mattermost-redux/src/reducers/entities/search.ts` - Shared search reducer
- `webapp/platform/packages/mattermost-redux/src/actions/search.ts` - Search actions
- `webapp/platform/packages/mattermost-redux/src/actions/posts.ts:427-507` - Pin/unpin actions
- `webapp/channels/src/actions/post_actions.ts:300-320` - Flag actions with RHS coupling
- `webapp/channels/src/actions/views/rhs.ts:359-400` - Show pinned posts action
- `webapp/channels/src/actions/views/rhs.ts` - Show flagged posts action

### Feature Components

**Search**:
- `webapp/channels/src/components/new_search/new_search.tsx` - Modern search UI
- `webapp/channels/src/components/new_search/search_box.tsx` - Search input
- `webapp/channels/src/components/new_search/hooks.tsx` - Search hooks

**Pinned Posts**:
- `webapp/channels/src/components/channel_header_menu/menu_items/view_pinned_posts.tsx` - Menu item
- `webapp/channels/src/components/post_view/post_pre_header/post_pre_header.tsx` - Pin badge
- `webapp/channels/src/components/dot_menu/dot_menu.tsx` - Pin/unpin actions

**Flagged Posts**:
- `webapp/channels/src/components/flag_message_modal/flag_post_modal.tsx` - Flag modal
- `webapp/channels/src/components/post_view/post_flag_icon/post_flag_icon.tsx` - Flag icon button
- `webapp/channels/src/components/remove_flagged_message_confirmation_modal/remove_flagged_message_confirmation_modal.tsx` - Reviewer modal

### Shared Utilities
- `webapp/channels/src/utils/post_utils.ts` - Post utilities
- `webapp/channels/src/components/dynamic_virtualized_list/` - Virtualized list
- `webapp/channels/src/components/no_results_indicator/` - Empty states
- `webapp/channels/src/components/post_view/date_separator/` - Date separators

## Open Questions

1. **Should we separate Redux slices or keep the shared search state?**
   - Current: All three use `state.entities.search`
   - Alternative: Separate `searchResults`, `flaggedPosts`, `pinnedPosts` slices
   - Consideration: Shared state reduces duplication but adds coupling

2. **How should we handle search highlighting in the decoupled architecture?**
   - Currently: Conditional based on `isFlaggedPosts` and `isPinnedPosts` flags
   - Proposed: Render prop or optional `highlightMatches` prop on PostListCore

3. **Should date separators be part of the core or injected?**
   - Current: Core logic in SearchResults
   - Proposed: Render prop for flexibility
   - Consideration: All three features currently use date separators

4. **What's the right level of abstraction for empty states?**
   - Option A: Fully custom render prop (proposed above)
   - Option B: Standardized `EmptyStateConfig` with limited customization
   - Consideration: Balance between flexibility and consistency

5. **Should we extract RHS panel management into a separate abstraction?**
   - Current: RHS logic mixed with feature logic
   - Potential: `RHSPanel` wrapper component handling routing and state
   - Consideration: Multiple features use RHS (search, threads, mentions, etc.)

6. **How should we handle keyboard shortcuts and accessibility navigation?**
   - Current: Hardcoded in SearchResults
   - Proposed: Configuration object passed to PostListCore
   - Consideration: Each feature may have different keyboard needs

## Related Research

- None found in `thoughts/shared/research/` directory (this is the first research document)

## Next Steps

1. **Review this research** with the team to validate the decoupling strategy
2. **Create ticket** for PostListCore extraction
3. **Design detailed API** for PostListCore render props
4. **Prototype FlaggedPostsContainer** as proof of concept
5. **Write migration plan** with rollback strategy
6. **Consider accessibility implications** of the new architecture
